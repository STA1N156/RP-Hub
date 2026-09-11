// Shared model API transport for chat, memory, templates and standalone pages.
(function () {
    const { extractApiErrorMessage, formatApiErrorMessage, getApiUsagePayload } = window.RPHubUtils;
    const { extractNativeReasoning, isNativeReasoningPart } = window.RPHubCardUtils;
    const buildApiEndpoint = (baseUrl, path) => {
        const root = String(baseUrl || '').replace(/\/+$/, '');
        const apiRoot = /\/v1$/i.test(root) ? root : `${root}/v1`;
        return `${apiRoot}/${String(path || '').replace(/^\/+/, '')}`;
    };

    const parsePayload = (text, status) => {
        const data = JSON.parse(text);
        const error = extractApiErrorMessage(data, status);
        if (error) throw new Error(error);
        return data;
    };
    const readTextContent = value => Array.isArray(value)
        ? value.filter(part => !isNativeReasoningPart(part)).map(part => part?.text || part?.content || '').join('')
        : String(value || '');
    // 仅用于日志：合并响应字段，不提取正文或解码工具参数。
    const mergeResponseDelta = (previous = {}, delta = {}, append = true) => {
        const merged = { ...previous };
        for (const [key, value] of Object.entries(delta)) {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
            if (Array.isArray(value)) {
                const items = Array.isArray(merged[key]) ? [...merged[key]] : [];
                if (!append) {
                    merged[key] = value.length ? value : items;
                    continue;
                }
                value.forEach((part, position) => {
                    const index = part?.index ?? (key === 'tool_calls' ? position : null);
                    if (Number.isInteger(index) && index >= 0) items[index] = mergeResponseDelta(items[index], part);
                    else items.push(part);
                });
                merged[key] = items;
            } else if (value && typeof value === 'object') {
                merged[key] = mergeResponseDelta(merged[key], value, append);
            } else if (typeof value === 'string' && /^(content|text|reasoning_content|reasoning|thinking|thinking_content|thought|thoughts|reasoning_text|refusal|arguments|name)$/.test(key)) {
                if (value || merged[key] === undefined) {
                    merged[key] = (append && typeof merged[key] === 'string' ? merged[key] : '') + value;
                }
            } else if (value !== null || merged[key] === undefined) {
                merged[key] = value;
            }
        }
        return merged;
    };
    const replyTool = {
        type: 'function',
        function: {
            name: 'output_reply',
            description: '将本次回复交给聊天界面显示。遵守现有输出规则，正文及需要附带的面板、图片标记、变量更新块等全部放入 content，不在普通消息中重复输出。检索工具返回结果后，只传新增回复内容。',
            parameters: {
                type: 'object',
                properties: { content: { type: 'string', description: '本次回复的原文，保留原有格式；作为 JSON 字符串正确转义。' } },
                required: ['content'],
                additionalProperties: false
            }
        }
    };

    // 超时按“多久没有响应”计算，持续输出的长回复不会因总时长被中断。
    const withApiResponse = async (options, read) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        let timer;
        let timedOut = false;
        const touch = () => {
            clearTimeout(timer);
            timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 120000);
        };
        if (options.signal?.aborted) abort();
        else options.signal?.addEventListener('abort', abort, { once: true });
        touch();
        try {
            const response = await fetch(options.url, {
                method: options.body === undefined ? 'GET' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
                ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
                signal: controller.signal
            });
            touch();
            if (!response.ok) {
                const text = await response.text();
                options.onErrorResponse?.(text);
                let payload;
                try { payload = JSON.parse(text); } catch (_) { }
                throw new Error(extractApiErrorMessage(payload, response.status) || formatApiErrorMessage(response.status, text));
            }
            return await read(response, touch);
        } catch (error) {
            if (timedOut && !options.signal?.aborted) {
                const timeout = new Error('API 响应超时，请稍后重试');
                timeout.name = 'TimeoutError';
                throw timeout;
            }
            throw error;
        } finally {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', abort);
        }
    };

    const requestJson = options => withApiResponse(options, async response => parsePayload(await response.text(), response.status));

    const requestChatCompletionOnce = async (options, attempt) => {
        const startedAt = Date.now();
        const logResponse = options.logResponse || options.replyInTool;
        let rawResponse = '';
        let streamResponse = null;
        const result = { content: '', reasoning: '', toolCalls: [], assistantMessage: null, usage: null, finishReason: null, isStream: false };
        let receivedPayload = false;
        let pendingContent = '';
        let pendingReasoning = '';
        const calls = new Map();
        const assistantMetadata = {};
        let toolsChanged = false;
        const toolSnapshot = () => [...calls.entries()].sort(([a], [b]) => a - b).map(([index, call]) => ({
            ...call, index, function: { ...call.function }
        }));
        const getReplyCall = () => [...calls.values()].find(call => call.function.name === replyTool.function.name);
        let plainContent = '';
        let refusal = '';
        let failure = null;
        let replyPosition = null;
        let replyClosed = false;
        const invalidReply = () => new Error('输出正文工具的参数格式错误，应为仅含 content 字符串的 JSON 对象');
        // 只解码已经收齐的字符串字符，JSON 外壳和未收齐的转义不会进入正文。
        const readReplyDelta = () => {
            const replyCall = getReplyCall();
            if (!replyCall || replyClosed) return '';
            const source = replyCall.function.arguments;
            if (replyPosition === null) {
                const header = /^\s*\{\s*"content"\s*:\s*"/.exec(source);
                if (!header) return '';
                replyPosition = header[0].length;
            }
            let text = '';
            let lastPosition = replyPosition;
            while (replyPosition < source.length) {
                const char = source[replyPosition];
                if (char === '"') { replyPosition++; replyClosed = true; break; }
                if (char.charCodeAt(0) < 32) throw invalidReply();
                let size = 1;
                if (char === '\\') {
                    const escape = source[replyPosition + 1];
                    if (!escape) break;
                    if (escape === 'u') {
                        const digits = source.slice(replyPosition + 2, replyPosition + 6);
                        if (/[^\da-f]/i.test(digits)) throw invalidReply();
                        if (digits.length < 4) break;
                        size = 6;
                    } else {
                        if (!'"\\/bfnrt'.includes(escape)) throw invalidReply();
                        size = 2;
                    }
                }
                lastPosition = replyPosition;
                text += size === 1 ? char : JSON.parse('"' + source.slice(replyPosition, replyPosition + size) + '"');
                replyPosition += size;
            }
            if (!replyClosed && /[\uD800-\uDBFF]$/.test(text)) {
                replyPosition = lastPosition;
                text = text.slice(0, -1);
            }
            return text;
        };
        const finish = () => {
            const nativeCalls = toolSnapshot();
            const replyCalls = nativeCalls.filter(call => call.function.name === replyTool.function.name);
            result.toolCalls = nativeCalls.filter(call => !options.replyInTool || call.function.name !== replyTool.function.name);
            if (nativeCalls.length && (result.finishReason === 'content_filter' || refusal.trim())) throw new Error('API 已停止工具输出');
            if (result.toolCalls.length) {
                // 工具调用必须保留服务端 ID；伪造 ID 会破坏下一轮的调用/结果配对。
                if (replyCalls.length || result.toolCalls.some(call => !call.id || call.type !== 'function' || !call.function.name)
                    || new Set(result.toolCalls.map(call => call.id)).size !== result.toolCalls.length) {
                    throw new Error('API 返回的工具调用不完整或混用了回复工具，请重新尝试');
                }
                result.assistantMessage = { role: 'assistant', content: plainContent || null, ...assistantMetadata,
                    tool_calls: result.toolCalls.map(({ index, ...call }) => call) };
                if (options.replyInTool) {
                    pendingContent += plainContent;
                    result.content = plainContent;
                }
                return result;
            }
            if (!options.replyInTool) return result;
            if (result.finishReason === 'content_filter' || refusal.trim()) throw new Error('API 已停止工具输出');
            if (replyCalls.length > 1) throw invalidReply();
            const replyArguments = getReplyCall()?.function.arguments || '';
            if (replyArguments.trim()) {
                let payload;
                try { payload = JSON.parse(replyArguments); }
                catch (_) {
                    if (replyPosition === null || (replyClosed && replyArguments.slice(replyPosition).trim())) throw invalidReply();
                    // 容忍末尾缺失的 JSON 闭合符号，保留已经解码的正文。
                }
                if (payload !== undefined) {
                    if (!payload || typeof payload.content !== 'string' || Object.keys(payload).length !== 1
                        || !payload.content.startsWith(result.content)) throw invalidReply();
                    pendingContent += payload.content.slice(result.content.length);
                    result.content = payload.content;
                }
            }
            // 响应结束后才选普通正文兜底，避免与稍后到来的工具正文重复。
            if (!result.content.trim()) {
                if (!plainContent.trim()) {
                    throw Object.assign(new Error('API 未返回抗截断输出，可能触发了空回或站点不支持，请重新尝试。'), {
                        // 已有思考或工具调用时不算真正空回，也不重试。
                        retryableEmptyToolReply: !calls.size && !result.reasoning.trim()
                    });
                }
                pendingContent += plainContent;
                result.content += plainContent;
            }
            return result;
        };
        const accept = data => {
            if (streamResponse) {
                const { choices = [], ...metadata } = data;
                streamResponse = mergeResponseDelta(streamResponse, metadata);
                choices.forEach((choice, position) => {
                    const { delta, message, ...fields } = choice;
                    const index = choice.index ?? position;
                    const previous = streamResponse.choices[index] || {};
                    streamResponse.choices[index] = {
                        ...mergeResponseDelta(previous, fields),
                        // 完整 message 不是增量；补齐已有字段，不能覆盖此前的思考或重复拼接正文。
                        message: delta ? mergeResponseDelta(previous.message, delta)
                            : message ? mergeResponseDelta(previous.message, message, false) : previous.message
                    };
                });
            }
            receivedPayload = true;
            result.usage = getApiUsagePayload(data) || result.usage;
            const choice = data.choices?.[0] || {};
            const message = choice.delta || choice.message || {};
            let content = readTextContent(message.content ?? choice.text);
            const reasoning = extractNativeReasoning(message) || extractNativeReasoning(choice) || '';
            plainContent += content;
            refusal += readTextContent(message.refusal);
            // 保留转接接口返回的签名和推理字段，原样用于本轮工具结果回传，不混进聊天正文。
            for (const key of ['reasoning_content', 'reasoning', 'reasoning_details', 'extra_content']) {
                if (message[key] == null) continue;
                assistantMetadata[key] = typeof message[key] === 'string'
                    ? (assistantMetadata[key] || '') + message[key]
                    : message[key];
            }
            for (const [position, part] of (message.tool_calls || []).entries()) {
                const index = part.index ?? position;
                if (!Number.isInteger(index) || index < 0 || (part.type && part.type !== 'function')) throw new Error('API 返回了无效的工具调用');
                let call = calls.get(index);
                if (!call) {
                    call = { id: '', type: 'function', function: { name: '', arguments: '' } };
                    calls.set(index, call);
                }
                if (part.id && call.id && part.id !== call.id) throw new Error('API 返回了冲突的工具调用 ID');
                call.id = part.id || call.id;
                for (const key of ['name', 'arguments']) {
                    if (part.function?.[key] == null) continue;
                    if (typeof part.function[key] !== 'string') throw new Error('API 工具参数应为 JSON 字符串');
                    call.function[key] += part.function[key];
                }
                if (part.extra_content) call.extra_content = { ...call.extra_content, ...part.extra_content };
                toolsChanged = true;
            }
            if (options.replyInTool) content = readReplyDelta();
            result.content += content;
            result.reasoning += reasoning;
            result.finishReason = choice.finish_reason ?? result.finishReason;
            pendingContent += content;
            pendingReasoning += reasoning;
        };
        try {
            const tools = [...(options.tools || []), ...(options.replyInTool && !options.requireTool ? [replyTool] : [])];
            return await withApiResponse({ ...options, onErrorResponse: text => {
                if (logResponse) rawResponse = text;
            }, body: {
                model: options.model, messages: options.messages, temperature: options.temperature,
                ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
                ...(tools.length ? {
                    tools,
                    tool_choice: options.requireTool || (options.replyInTool && options.tools?.length) ? 'required'
                        : options.replyInTool ? { type: 'function', function: { name: replyTool.function.name } } : 'auto',
                    parallel_tool_calls: false
                } : {}),
                stream: !!options.stream,
                ...(options.stream ? { stream_options: { include_usage: true } } : {})
            } }, async (response, touch) => {
                const eventStream = response.headers.get('content-type')?.includes('text/event-stream');
                let rawText;
                if (!eventStream) {
                    rawText = await response.text();
                    if (!/^\s*(?:data:|:)/.test(rawText)) {
                        if (logResponse) rawResponse = rawText;
                        accept(parsePayload(rawText, response.status));
                        return finish();
                    }
                }
                if (logResponse) streamResponse = { choices: [] };
                result.isStream = !!options.stream;
                let buffer = '';
                let eventLines = [];
                let done = false;
                let flushPromise = Promise.resolve();
                const flush = () => {
                    if (!result.isStream || (!pendingContent && !pendingReasoning && !toolsChanged)) return;
                    const delta = { content: pendingContent, reasoning: pendingReasoning,
                        ...(toolsChanged ? { toolCalls: toolSnapshot().filter(call => call.function.name
                            && !(options.replyInTool && replyTool.function.name.startsWith(call.function.name))) } : {}) };
                    pendingContent = pendingReasoning = '';
                    toolsChanged = false;
                    flushPromise = flushPromise.then(() => options.onDelta?.(delta));
                    // 立即挂上处理器，最终仍由 await 抛出回调错误。
                    flushPromise.catch(() => {});
                };
                const dispatch = () => {
                    if (!eventLines.length) return;
                    const payload = eventLines.join('\n');
                    eventLines = [];
                    if (payload.trim() === '[DONE]') {
                        done = true;
                        return;
                    }
                    if (payload.trim()) accept(parsePayload(payload, response.status));
                };
                const readLine = line => {
                    if (done) return;
                    if (!line.trim()) dispatch();
                    else if (line.startsWith('data:')) {
                        // 部分兼容接口省略事件间空行，但多行 JSON 仍需等它完整。
                        let complete = eventLines.join('\n').trim() === '[DONE]';
                        try { JSON.parse(eventLines.join('\n')); complete = true; } catch (_) { }
                        if (complete) dispatch();
                        if (!done) eventLines.push(line.slice(5).replace(/^ /, ''));
                    }
                };
                const feed = text => {
                    buffer += text;
                    const lines = buffer.split(/\r\n|\n|\r(?!$)/);
                    buffer = lines.pop();
                    lines.forEach(readLine);
                };
                const reader = rawText === undefined ? response.body.getReader() : null;
                const decoder = new TextDecoder();
                const interval = setInterval(flush, 60);
                try {
                    if (reader) {
                        while (!done) {
                            const chunk = await reader.read();
                            touch();
                            if (chunk.done) break;
                            feed(decoder.decode(chunk.value, { stream: true }));
                        }
                        feed(decoder.decode());
                    } else feed(rawText);
                    // 兼容缺失最后换行的完整 JSON；损坏 JSON 必须报错，不能伪装成功。
                    if (!done) { readLine(buffer.replace(/\r$/, '')); dispatch(); }
                    if (!receivedPayload) throw new Error('API 未返回有效的模型响应');
                    return finish();
                } finally {
                    clearInterval(interval);
                    if (reader) {
                        try { await reader.cancel(); } catch (_) { }
                        reader.releaseLock();
                    }
                    flush();
                    await flushPromise;
                }
            });
        } catch (error) {
            failure = error;
            throw error;
        } finally {
            if (logResponse) console.info(options.logResponse ? '[模型输出][最新一次]' : '[Gemini抗截断]', {
                模型: options.model, 次数: attempt, 结果: failure ? failure.message : '成功',
                响应体: rawResponse || (streamResponse ? JSON.stringify(streamResponse) : '')
            });
            // 在业务层 JSON/模板校验之前记账；部分流式响应后中止也不会漏掉已返回的用量。
            if (receivedPayload) options.onUsage?.(result.usage, {
                isStream: result.isStream, durationMs: Date.now() - startedAt,
                outputCharacters: [...calls.values()].reduce((sum, call) => sum + call.function.arguments.length, 0) + plainContent.length + result.reasoning.length
            });
        }
    };

    const requestChatCompletion = async options => {
        for (let attempt = 1; ; attempt++) {
            try { return await requestChatCompletionOnce(options, attempt); }
            catch (error) {
                if (!error.retryableEmptyToolReply || attempt >= 3 || options.signal?.aborted) throw error;
            }
        }
    };

    window.RPHubApiUtils = Object.freeze({ buildApiEndpoint });
    window.RPHubApiClient = Object.freeze({ requestChatCompletion, requestJson });
})();
