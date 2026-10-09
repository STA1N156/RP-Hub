// RP-Hub message rendering and application composables.

// --- Message renderer ---
(function () {
    const MAX_CACHE_SIZE = 2000;

    const createMessageRenderer = ({
        processRegex, replaceUserPlaceholder, createExecutableHtmlIframe, marked, DOMPurify,
        getMemoryCitationLabel = () => '', getMemoryCitationVersion = () => ''
    }) => {
        const renderedCache = new Map();
        const frameDetectionCache = new Map();

        const cacheValue = (cache, key, value) => {
            cache.set(key, value);
            if (cache.size > MAX_CACHE_SIZE) cache.delete(cache.keys().next().value);
            return value;
        };

        const clearCaches = () => {
            renderedCache.clear();
            frameDetectionCache.clear();
        };

        const applyDisplayRegex = (text, role, skipRegex) => {
            const replaced = replaceUserPlaceholder(text);
            return skipRegex ? replaced : processRegex(replaced, { isDisplay: true, role });
        };

        const contentUsesHtmlFrame = (text, role = 'assistant', skipRegex = false) => {
            if (!text) return false;
            const cacheKey = `${role}_${skipRegex}_${text}`;
            if (frameDetectionCache.has(cacheKey)) return frameDetectionCache.get(cacheKey);

            const trimmed = applyDisplayRegex(text, role, skipRegex).trim();
            let usesFrame = false;
            const codeFencePattern = /```([^\n`]*)\n?([\s\S]*?)```/g;
            let codeMatch;
            while ((codeMatch = codeFencePattern.exec(trimmed)) !== null) {
                const language = codeMatch[1] || '';
                const content = codeMatch[2] || '';
                if (/\b(html|xml)\b/i.test(language)
                    || /^\s*<(!doctype|html|head|body|div|span|style|script|table|img)/i.test(content)) {
                    usesFrame = true;
                    break;
                }
            }
            if (!usesFrame && !trimmed.includes('```')) {
                usesFrame = /(<!doctype html>|<html\b[^>]*>|^\s*<(style|script)\b)/i.test(trimmed);
            }
            return cacheValue(frameDetectionCache, cacheKey, usesFrame);
        };

        const cleanConfig = {
            ADD_TAGS: ['details', 'summary', 'iframe', 'svg', 'path', 'g', 'circle', 'rect', 'defs', 'linearGradient', 'stop', 'style', 'div', 'span', 'script', 'button', 'input'],
            ADD_ATTR: ['style', 'open', 'srcdoc', 'sandbox', 'frameborder', 'allow', 'allowfullscreen', 'class', 'id', 'viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'stroke-linecap', 'stroke-linejoin', 'x1', 'y1', 'x2', 'y2', 'offset', 'stop-color', 'stop-opacity', 'width', 'height', 'onclick', 'type', 'value', 'checked', 'data-slash'],
            FORBID_ATTR: ['onmouseover', 'onload'],
            FORCE_BODY: true
        };

        const sanitizeMarkdown = (text) => DOMPurify.sanitize(marked.parse(text), cleanConfig);
        const markdownOnlyRenderer = new marked.Renderer();
        markdownOnlyRenderer.html = token => String(typeof token === 'string' ? token : token.text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const createIframe = (html) => createExecutableHtmlIframe(html, 'border-t border-gray-200 shadow-sm');

        const replaceHtmlCodeBlocks = (documentNode) => {
            let modified = false;
            documentNode.querySelectorAll('pre code').forEach(block => {
                const rawHtml = block.textContent;
                const hasHtmlLanguage = block.classList.contains('language-html') || block.classList.contains('language-xml');
                const looksLikeHtml = /^\s*<(!doctype|html|head|body|div|span|style|script|table|img)/i.test(rawHtml);
                if (!hasHtmlLanguage && !looksLikeHtml) return;
                const pre = block.parentElement;
                if (!pre?.parentNode) return;
                pre.parentNode.replaceChild(createIframe(rawHtml), pre);
                modified = true;
            });
            return modified;
        };

        const replaceEscapedHtmlParagraphs = (documentNode) => {
            let modified = false;
            documentNode.querySelectorAll('p').forEach(paragraph => {
                if (!/^\s*</.test(paragraph.innerHTML)) return;
                const rawHtml = paragraph.textContent;
                if (!/^\s*<(!doctype|html|head|body|div|span|style|script|table|img)/i.test(rawHtml)) return;
                if (!paragraph.parentNode) return;
                paragraph.parentNode.replaceChild(createIframe(rawHtml), paragraph);
                modified = true;
            });
            return modified;
        };

        const replaceScriptedPanels = (documentNode) => {
            let modified = false;
            documentNode.querySelectorAll('div[style*="position"], div[style*="background"], div[class*="panel"]').forEach(panel => {
                if (!panel.querySelector('script') || !panel.parentNode) return;
                panel.parentNode.replaceChild(createIframe(panel.outerHTML), panel);
                modified = true;
            });
            return modified;
        };

        // 正文里的记忆引用 [M12]：编号变成可点的小角标，并给它前面那句话加下划线。
        // 往回找到句末标点、上一处引用或段落开头为止；跨格式的长句只会划到能可靠切开的位置。
        const MEMORY_CITATION_PATTERN = /((?:\[M\d{1,6}\])+)/;
        // 引号里的句末标点后面紧跟“她说”之类的叙述时不算断句，整句一起划线。
        const SENTENCE_END_PATTERN = /[。！？!?…]+(?![。！？!?…])(?:[”’」』"']+(?=$|[\s“‘「『"'])|(?![”’」』"']))\s*|\n+/g;
        const TRAILING_PUNCTUATION_PATTERN = /[\s。！？!?…，,；;：:”’」』）)"']+$/;
        const underlineCitedSentence = (cite) => {
            const nodes = [];
            let following = '';
            for (let node = cite.previousSibling; node; node = node.previousSibling) {
                if (node.nodeType === 1 && node.matches('.memory-cite, .memory-cite-text, br, img, iframe')) break;
                const text = node.textContent;
                // 句子自己的句末标点紧挨着引用，不能当成上一句的结尾；带上后面已划进来的文字一起判断，
                // 正则给引语单独加了样式时，问号和标签外的引号、叙述仍连成一句。
                const body = nodes.length ? text : text.replace(TRAILING_PUNCTUATION_PATTERN, '');
                let boundary = -1;
                for (const match of (body + following).matchAll(SENTENCE_END_PATTERN)) {
                    if (match.index < body.length) boundary = Math.min(match.index + match[0].length, body.length);
                }
                if (boundary < 0) {
                    nodes.unshift(node);
                    following = text + following;
                    continue;
                }
                if (node.nodeType === 3 && boundary < text.length) nodes.unshift(node.splitText(boundary));
                else if (node.nodeType === 1 && !nodes.length) nodes.unshift(node);
                break;
            }
            if (!nodes.some(node => node.textContent.trim())) return;
            const span = cite.ownerDocument.createElement('span');
            span.className = 'memory-cite-text';
            span.dataset.memoryNos = cite.dataset.memoryNos;
            nodes[0].before(span);
            span.append(...nodes);
        };
        const decorateMemoryCitations = (documentNode) => {
            const textNodes = [];
            const walker = documentNode.createTreeWalker(documentNode.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (MEMORY_CITATION_PATTERN.test(node.nodeValue) && !node.parentElement?.closest('pre, code, a, button, script, style, textarea')) textNodes.push(node);
            }
            textNodes.forEach(node => {
                const fragment = documentNode.createDocumentFragment();
                node.nodeValue.split(MEMORY_CITATION_PATTERN).forEach((part, index) => {
                    if (index % 2 === 0) {
                        if (part) fragment.append(part);
                        return;
                    }
                    const numbers = part.match(/\d+/g);
                    const cite = documentNode.createElement('button');
                    cite.type = 'button';
                    cite.className = 'memory-cite';
                    cite.dataset.memoryNos = numbers.join(',');
                    // 角标显示记忆对应的轮次：单轮如 3，合并总结如 1-5；找不到的记忆显示问号。
                    const labels = numbers.map(no => getMemoryCitationLabel(Number(no)) || '?');
                    cite.setAttribute('aria-label', `查看判断依据：第 ${labels.join('、')} 轮`);
                    cite.textContent = labels.join(',');
                    fragment.append(cite);
                });
                node.replaceWith(fragment);
            });
            documentNode.querySelectorAll('.memory-cite').forEach(underlineCitedSentence);
            return textNodes.length > 0;
        };
        // 以 HTML 开头的回复不经过 Markdown，正文文字直接挂在最外层；消息容器会把最外层的每个子元素排成单独一块，
        // 所以把带引用的那段行内内容包进段落，角标才会跟在句末。
        const BLOCK_TAG_PATTERN = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DETAILS|DIV|DL|FIELDSET|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|IFRAME|LI|MAIN|NAV|OL|P|PRE|SCRIPT|SECTION|STYLE|TABLE|UL)$/;
        const wrapLooseCitationText = (documentNode) => {
            const body = documentNode.body;
            const isInline = node => node && (node.nodeType === 3 || (node.nodeType === 1 && !BLOCK_TAG_PATTERN.test(node.tagName)));
            [...body.childNodes].forEach(node => {
                if (node.parentNode !== body || node.nodeType !== 3 || !MEMORY_CITATION_PATTERN.test(node.nodeValue)) return;
                let start = node;
                let end = node;
                while (isInline(start.previousSibling)) start = start.previousSibling;
                while (isInline(end.nextSibling)) end = end.nextSibling;
                const paragraph = documentNode.createElement('p');
                start.before(paragraph);
                for (let current = start, next; current; current = next) {
                    next = current === end ? null : current.nextSibling;
                    paragraph.append(current);
                }
            });
        };
        // 正则替换成 HTML、或本身以 HTML 开头的回复走单独的渲染分支，也要补上记忆引用。
        const decorateHtml = (html, role) => {
            if (role !== 'assistant' || !/\[M\d/.test(html)) return html;
            const documentNode = new DOMParser().parseFromString(html, 'text/html');
            wrapLooseCitationText(documentNode);
            return decorateMemoryCitations(documentNode) ? documentNode.body.innerHTML : html;
        };
        // 美化正则可能会改写方括号（例如把 [状态] 变成标签），先把引用换成正则碰不到的占位符，替换完再还原。
        const protectCitations = text => text.replace(/\[M(\d{1,6})\]/g, '\uE000M$1\uE001');
        const restoreCitations = text => text.replace(/\uE000M(\d{1,6})\uE001/g, '[M$1]');

        const renderMarkdown = (text, role = 'assistant', skipRegex = false, allowHtml = true) => {
            if (!text) return '';
            // 记忆的轮次会随删改楼层变化，带引用的回复按当前对照表缓存，轮次变了角标跟着更新。
            const citationVersion = role === 'assistant' && text.includes('[M') ? getMemoryCitationVersion() : '';
            const cacheKey = `${role}_${skipRegex}_${allowHtml}_${citationVersion}_${text}`;
            if (renderedCache.has(cacheKey)) return renderedCache.get(cacheKey);

            let processed = role === 'assistant'
                ? restoreCitations(applyDisplayRegex(protectCitations(text), role, skipRegex))
                : applyDisplayRegex(text, role, skipRegex);
            if (!allowHtml) {
                const html = DOMPurify.sanitize(marked.parse(processed, { renderer: markdownOnlyRenderer }));
                return cacheValue(renderedCache, cacheKey, decorateHtml(html, role));
            }
            const trimmed = processed.trim();
            const htmlMatch = trimmed.match(/(<!doctype html>|<html\b[^>]*>)/i);

            if (htmlMatch && !trimmed.includes('```')) {
                const startIndex = htmlMatch.index;
                const closeTag = '</html>';
                const closeIndex = trimmed.toLowerCase().lastIndexOf(closeTag);
                const hasCloseTag = closeIndex !== -1 && closeIndex > startIndex;
                const endIndex = hasCloseTag ? closeIndex + closeTag.length : trimmed.length;
                const htmlContent = trimmed.substring(startIndex, endIndex);
                const preText = trimmed.substring(0, startIndex);
                const postText = hasCloseTag ? trimmed.substring(endIndex) : '';
                const container = document.createElement('div');
                container.className = 'html-card-container';
                container.style.margin = '0';
                container.style.paddingBottom = '0';
                container.style.marginBottom = '-1px';
                container.appendChild(createIframe(htmlContent));
                const result = [
                    preText.trim() ? decorateHtml(sanitizeMarkdown(preText), role) : '',
                    container.outerHTML,
                    postText.trim() ? decorateHtml(sanitizeMarkdown(postText), role) : ''
                ].join('');
                return cacheValue(renderedCache, cacheKey, result);
            }

            if (/^\s*<(div|table|section|article|aside|header|footer|style|script)/i.test(trimmed)
                && !trimmed.includes('```')) {
                return cacheValue(renderedCache, cacheKey, decorateHtml(DOMPurify.sanitize(processed, cleanConfig), role));
            }

            const lowerTrimmed = trimmed.toLowerCase();
            if (lowerTrimmed.includes('<html') || lowerTrimmed.includes('<!doctype')) {
                processed = processed
                    .replace(/<!DOCTYPE html>/gi, '')
                    .replace(/<\/?html[^>]*>/gi, '')
                    .replace(/<\/?head[^>]*>/gi, '')
                    .replace(/<\/?body[^>]*>/gi, '');
            }

            const html = sanitizeMarkdown(processed);
            try {
                const documentNode = new DOMParser().parseFromString(html, 'text/html');
                const codeBlocksChanged = replaceHtmlCodeBlocks(documentNode);
                const paragraphsChanged = replaceEscapedHtmlParagraphs(documentNode);
                const panelsChanged = replaceScriptedPanels(documentNode);
                const citationsChanged = role === 'assistant' && decorateMemoryCitations(documentNode);
                const modified = codeBlocksChanged || paragraphsChanged || panelsChanged || citationsChanged;
                if (modified) return cacheValue(renderedCache, cacheKey, documentNode.body.innerHTML);
            } catch (error) {
                console.error('Error rendering HTML preview:', error);
            }
            return cacheValue(renderedCache, cacheKey, html);
        };

        return { clearCaches, contentUsesHtmlFrame, decorateMemoryCitations, renderMarkdown };
    };

    window.RPHubMessageRenderer = Object.freeze({ createMessageRenderer });
})();

// --- Application composables ---
(function () {
    const { computed, reactive, ref, watch } = Vue;

    const useTokenUsage = ({
        pageSize = 10,
        cloneForStorage,
        confirm,
        ensureStorage,
        generateUUID,
        getApiKey,
        getApiUrl,
        normalizeApiUsage,
        saveStoredValue,
        toast
    }) => {
        const tokenUsageHistory = ref([]);
        const tokenUsagePage = ref(1);
        const tokenUsageFilter = ref('all');
        const tokenUsageTimeFilter = ref('all');
        const showTokenUsageTimeFilter = ref(false);
        const tokenUsageTimeFilterOptions = Object.freeze([
            { value: 'all', label: '全部' },
            { value: '24h', label: '24小时' },
            { value: '7d', label: '7天' },
            { value: '30d', label: '30天' }
        ]);
        const tokenUsageTimeRanges = Object.freeze({
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000
        });
        const tokenUsageTimeFilterLabel = computed(() => (
            tokenUsageTimeFilterOptions.find(option => option.value === tokenUsageTimeFilter.value)?.label || '全部'
        ));
        const getTokenUsageCategory = (type) => {
            if (['summary', 'embedding'].includes(type)) return 'memory';
            if (type === 'ui_template') return 'variables';
            return 'chat';
        };
        const filteredTokenUsageHistory = computed(() => {
            const timeRange = tokenUsageTimeRanges[tokenUsageTimeFilter.value];
            const cutoff = timeRange ? Date.now() - timeRange : 0;
            return tokenUsageHistory.value.filter(record => {
                const matchesType = tokenUsageFilter.value === 'all'
                    || getTokenUsageCategory(record.type) === tokenUsageFilter.value;
                if (!matchesType || !timeRange) return matchesType;
                const timestamp = Number(record.timestamp);
                return Number.isFinite(timestamp) && timestamp >= cutoff;
            });
        });
        const getUncachedInputTokens = (record) => {
            if (!Number.isFinite(record?.inputTokens)) return null;
            const cached = Number.isFinite(record.cacheReadTokens) ? record.cacheReadTokens : 0;
            return Math.max(0, record.inputTokens - cached);
        };
        const tokenUsageStats = computed(() => filteredTokenUsageHistory.value.reduce((stats, record) => {
            const inputTokens = getUncachedInputTokens(record);
            if (inputTokens !== null) {
                stats.inputTokens += inputTokens;
                stats.inputTokensReports++;
            }
            ['outputTokens', 'cacheReadTokens'].forEach(key => {
                if (!Number.isFinite(record[key])) return;
                stats[key] += record[key];
                stats[`${key}Reports`]++;
            });
            return stats;
        }, {
            inputTokens: 0,
            inputTokensReports: 0,
            outputTokens: 0,
            outputTokensReports: 0,
            cacheReadTokens: 0,
            cacheReadTokensReports: 0
        }));
        const tokenUsagePageCount = computed(() => Math.max(
            1,
            Math.ceil(filteredTokenUsageHistory.value.length / pageSize)
        ));
        const displayedTokenUsageHistory = computed(() => {
            const start = (tokenUsagePage.value - 1) * pageSize;
            return filteredTokenUsageHistory.value.slice(start, start + pageSize);
        });
        const latestMainTokenUsage = computed(() => tokenUsageHistory.value.find(
            record => record.type === 'chat' || record.type === 'tool_continuation'
        ) || null);
        const formatLatestTokenCount = value => {
            const count = Number(value || 0);
            if (count <= 0) return '0.00w';
            return `${Math.max(0.01, count / 10000).toFixed(2)}w`;
        };

        let saveQueue = Promise.resolve();
        const saveTokenUsageHistoryNow = () => {
            const snapshot = cloneForStorage(tokenUsageHistory.value);
            const saveTask = async () => {
                await ensureStorage();
                await saveStoredValue('token_usage_history', snapshot, { clone: false });
            };
            saveQueue = saveQueue.then(saveTask, saveTask);
            return saveQueue;
        };
        const fetchLatestQuota = async (record, apiKey) => {
            try {
                const getLogKey = log => String(log?.request_id || [log?.created_at, log?.model_name, log?.prompt_tokens, log?.completion_tokens].join('|'));
                for (const delay of [500, 5000]) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    const apiRoot = record.apiUrl.replace(/\/+$/, '').replace(/\/v1$/i, '');
                    const response = await fetch(`${apiRoot}/api/log/token`, {
                        headers: { Authorization: `Bearer ${apiKey}` }
                    });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const payload = await response.json();
                    const logs = Array.isArray(payload?.data) ? payload.data : (payload?.data?.items || []);
                    const claimedLogs = new Set(tokenUsageHistory.value.map(item => item.usageLogKey).filter(Boolean));
                    const log = logs.filter(item => !claimedLogs.has(getLogKey(item))
                        && Number(item?.type) === 2
                        && String(item?.model_name || '') === record.model
                        && Math.abs(Number(item?.created_at) * 1000 - record.timestamp) < 120000
                        && (!Number.isFinite(record.inputTokens) || Number(item?.prompt_tokens) === record.inputTokens)
                        && (!Number.isFinite(record.outputTokens) || Number(item?.completion_tokens) === record.outputTokens))
                        .sort((a, b) => Math.abs(Number(a.created_at) * 1000 - record.timestamp) - Math.abs(Number(b.created_at) * 1000 - record.timestamp))[0];
                    if (!log || !Number.isFinite(Number(log.quota))) continue;
                    record.actualQuota = Number(log.quota);
                    record.usageGroup = String(log.group || '');
                    record.usageLogKey = getLogKey(log);
                    saveTokenUsageHistoryNow().catch(error => console.error('Token usage history save failed:', error));
                    return;
                }
            } catch (error) {
                console.warn('New API usage log fetch failed:', error);
            }
        };
        const recordApiUsage = (usage, meta = {}) => {
            const record = reactive({
                id: generateUUID(),
                timestamp: Date.now(),
                type: meta.type || 'chat',
                model: String(meta.model || ''),
                apiUrl: String(meta.apiUrl ?? getApiUrl?.() ?? ''),
                isStream: meta.isStream === true,
                durationMs: Number.isFinite(meta.durationMs) ? Math.max(0, meta.durationMs) : null,
                outputCharacters: Number.isFinite(meta.outputCharacters) ? Math.max(0, meta.outputCharacters) : null,
                ...normalizeApiUsage(usage)
            });
            tokenUsageHistory.value.unshift(record);
            const apiKey = String(meta.apiKey ?? getApiKey?.() ?? '').trim();
            if (record.apiUrl && apiKey) fetchLatestQuota(record, apiKey);
            saveTokenUsageHistoryNow().catch(error => console.error('Token usage history save failed:', error));
        };
        const clearTokenUsageHistory = () => {
            confirm('确定要清空全部 Token 用量记录吗？此操作无法撤销。', async () => {
                tokenUsageHistory.value = [];
                tokenUsagePage.value = 1;
                await saveTokenUsageHistoryNow();
                toast('Token 用量记录已清空', 'success');
            });
        };

        watch([tokenUsageFilter, tokenUsageTimeFilter], () => { tokenUsagePage.value = 1; });
        watch(tokenUsagePageCount, count => { tokenUsagePage.value = Math.min(tokenUsagePage.value, count); });

        return {
            clearTokenUsageHistory,
            displayedTokenUsageHistory,
            filteredTokenUsageHistory,
            formatLatestTokenCount,
            formatTokenAggregate: (value, reports) => {
                if (reports <= 0 || value <= 0) return '0';
                if (value >= 1e9) return `${Number((value / 1e9).toFixed(2))}B`;
                if (value >= 1e6) return `${Number((value / 1e6).toFixed(2))}M`;
                return value.toLocaleString();
            },
            formatTokenCount: (value) => Number.isFinite(value) ? value.toLocaleString() : '0',
            formatTokenUsageTime: (timestamp) => {
                const date = new Date(timestamp);
                const year = date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric';
                return date.toLocaleString('zh-CN', { year, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
            },
            getTokenUsageCategory,
            getUncachedInputTokens,
            latestMainTokenUsage,
            recordApiUsage,
            showTokenUsageTimeFilter,
            tokenUsageFilter,
            tokenUsageHistory,
            tokenUsagePage,
            tokenUsagePageCount,
            tokenUsageStats,
            tokenUsageTimeFilter,
            tokenUsageTimeFilterLabel,
            tokenUsageTimeFilterOptions
        };
    };

    const useStorageManagement = ({
        characters,
        confirm,
        deleteStorageKeys,
        ensureStorage,
        getBranchOwnerId,
        getLegacyDb,
        getMainDb,
        getStorageLogicalKey,
        globalUiTemplates,
        readStorageKeys,
        saveStoredValue,
        scanStorageEntries,
        scopedStorageNames,
        toast
    }) => {
        const categories = Object.freeze([
            { key: 'characters', label: '角色卡', color: '#4659e2' },
            { key: 'chat', label: '聊天记录', color: '#7b8ff8' },
            { key: 'classic', label: '记忆系统', color: '#4fb3a4' },
            { key: 'other', label: '其他', color: '#9d9dab' }
        ]);
        const storageStats = reactive({
            loading: false,
            cleaning: false,
            hasMeasured: false,
            error: '',
            usage: 0,
            quota: 0,
            orphanedBytes: 0,
            orphanedItems: 0,
            categories: []
        });
        let unusedSnapshot = { mainKeys: [], legacyKeys: [], templateRuntimeKeys: [] };

        const formatStorageSize = (bytes) => {
            const size = Math.max(0, Number(bytes) || 0);
            if (size < 1024) return `${Math.round(size)} B`;
            const units = ['KB', 'MB', 'GB'];
            let value = size / 1024;
            let unit = units[0];
            for (let index = 1; index < units.length && value >= 1024; index++) {
                value /= 1024;
                unit = units[index];
            }
            return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
        };
        const getScopedStorageInfo = (logicalKey) => {
            for (const name of scopedStorageNames) {
                const prefix = `${name}_`;
                if (logicalKey.startsWith(prefix)) return { name, id: logicalKey.slice(prefix.length) };
            }
            return null;
        };
        const getStorageCategory = (logicalKey) => {
            if (logicalKey === 'characters') return 'characters';
            if (logicalKey.startsWith('chat_')) return 'chat';
            if (logicalKey.startsWith('classic_memories_')) return 'classic';
            return 'other';
        };
        const estimateStorageValueSize = (value, seen = new WeakSet()) => {
            if (value == null) return 0;
            if (typeof value === 'string') return value.length * 2;
            if (typeof value === 'number' || typeof value === 'bigint') return 8;
            if (typeof value === 'boolean') return 4;
            if (typeof value !== 'object') return 0;
            if (value instanceof Blob) return value.size;
            if (value instanceof ArrayBuffer) return value.byteLength;
            if (ArrayBuffer.isView(value)) return value.byteLength;
            if (seen.has(value)) return 0;
            seen.add(value);

            let bytes = 0;
            if (Array.isArray(value)) {
                if (value.length && typeof value[0] === 'number') return value.length * 8;
                value.forEach(item => { bytes += estimateStorageValueSize(item, seen); });
            } else {
                Object.keys(value).forEach(key => {
                    bytes += key.length * 2 + estimateStorageValueSize(value[key], seen);
                });
            }
            return bytes;
        };
        const estimateStorageEntrySize = (key, value) => String(key).length * 2 + estimateStorageValueSize(value);

        const refreshStorageStats = async () => {
            if (storageStats.loading) return;
            storageStats.loading = true;
            storageStats.error = '';
            try {
                await ensureStorage();
                const [mainKeys, legacyKeys, estimate] = await Promise.all([
                    readStorageKeys(getMainDb()),
                    readStorageKeys(getLegacyDb()),
                    navigator.storage?.estimate?.().catch(() => ({})) || Promise.resolve({})
                ]);
                const mainLogicalKeys = new Set(mainKeys.map(getStorageLogicalKey));
                const scopedLogicalKeys = new Set([...mainKeys, ...legacyKeys]
                    .map(getStorageLogicalKey)
                    .filter(logicalKey => getScopedStorageInfo(logicalKey)));
                const liveCharacterIds = new Set(characters.value.map(character => character?.uuid).filter(Boolean));
                const isOrphanedEntry = (source, logicalKey) => {
                    // 旧正文分片已停用，仅在用户确认清理时删除。
                    if (logicalKey.startsWith('memories_')) return true;
                    if (source === 'legacy' && mainLogicalKeys.has(logicalKey)) return true;
                    const scoped = getScopedStorageInfo(logicalKey);
                    if (!scoped || liveCharacterIds.has(getBranchOwnerId(scoped.id))) return false;
                    if (scoped.name !== 'chat' || !/^\d+$/.test(scoped.id)) return true;
                    const character = characters.value[Number(scoped.id)];
                    return !character || (character.uuid && scopedLogicalKeys.has(`chat_${character.uuid}`));
                };

                const categoryBytes = new Map(categories.map(category => [category.key, 0]));
                const orphanedKeys = { main: [], legacy: [] };
                let orphanedEntryBytes = 0;
                const inspectEntry = (source, key, value) => {
                    const logicalKey = getStorageLogicalKey(key);
                    const bytes = estimateStorageEntrySize(key, value);
                    const category = getStorageCategory(logicalKey);
                    categoryBytes.set(category, categoryBytes.get(category) + bytes);
                    if (isOrphanedEntry(source, logicalKey)) {
                        orphanedKeys[source].push(key);
                        orphanedEntryBytes += bytes;
                    }
                };
                await scanStorageEntries(getMainDb(), 'main', inspectEntry);
                await scanStorageEntries(getLegacyDb(), 'legacy', inspectEntry);

                const templateRuntimeKeys = [];
                globalUiTemplates.value.forEach((template, templateIndex) => {
                    Object.keys(template.runtimeByCharacter || {}).forEach(characterId => {
                        if (!liveCharacterIds.has(getBranchOwnerId(characterId))) {
                            templateRuntimeKeys.push({ templateIndex, characterId });
                        }
                    });
                });
                const embeddedOrphanBytes = templateRuntimeKeys.reduce((total, item) => (
                    total + estimateStorageEntrySize(
                        item.characterId,
                        globalUiTemplates.value[item.templateIndex]?.runtimeByCharacter?.[item.characterId]
                    )
                ), 0);

                try {
                    for (let index = 0; index < localStorage.length; index++) {
                        const key = localStorage.key(index);
                        const bytes = estimateStorageEntrySize(key || '', localStorage.getItem(key) || '');
                        const category = getStorageCategory(key || '');
                        categoryBytes.set(category, categoryBytes.get(category) + bytes);
                    }
                } catch (_) { }

                const accountedBytes = [...categoryBytes.values()].reduce((total, bytes) => total + bytes, 0);
                const measuredUsage = Number(estimate.usage) || accountedBytes;
                const sizeScale = accountedBytes > 0 ? measuredUsage / accountedBytes : 1;
                storageStats.usage = measuredUsage;
                storageStats.quota = Number(estimate.quota) || 0;
                storageStats.orphanedBytes = (orphanedEntryBytes + embeddedOrphanBytes) * sizeScale;
                storageStats.orphanedItems = orphanedKeys.main.length + orphanedKeys.legacy.length
                    + templateRuntimeKeys.length;
                storageStats.categories = categories
                    .map(category => ({ ...category, bytes: (categoryBytes.get(category.key) || 0) * sizeScale }))
                    .filter(category => category.bytes > 0);
                unusedSnapshot = {
                    mainKeys: orphanedKeys.main,
                    legacyKeys: orphanedKeys.legacy,
                    templateRuntimeKeys
                };
                storageStats.hasMeasured = true;
            } catch (error) {
                console.error('Failed to inspect storage:', error);
                storageStats.error = '读取存储信息失败，请稍后重试';
                storageStats.orphanedBytes = 0;
                storageStats.orphanedItems = 0;
                storageStats.categories = [];
                unusedSnapshot = { mainKeys: [], legacyKeys: [], templateRuntimeKeys: [] };
            } finally {
                storageStats.loading = false;
            }
        };

        const cleanupUnusedStorage = async () => {
            await refreshStorageStats();
            if (storageStats.error) return;
            if (storageStats.orphanedItems === 0) {
                toast('没有发现无用残留', 'info');
                return;
            }
            const snapshot = {
                mainKeys: [...unusedSnapshot.mainKeys],
                legacyKeys: [...unusedSnapshot.legacyKeys],
                templateRuntimeKeys: unusedSnapshot.templateRuntimeKeys.map(item => ({ ...item }))
            };
            const orphanedBytes = storageStats.orphanedBytes;
            const orphanedItems = storageStats.orphanedItems;
            confirm(
                `将清理 ${orphanedItems} 项无用残留（约 ${formatStorageSize(orphanedBytes)}）。现有角色的数据不会受到影响。`,
                async () => {
                    storageStats.cleaning = true;
                    try {
                        await Promise.all([
                            deleteStorageKeys(getMainDb(), snapshot.mainKeys),
                            deleteStorageKeys(getLegacyDb(), snapshot.legacyKeys)
                        ]);
                        snapshot.templateRuntimeKeys.forEach(({ templateIndex, characterId }) => {
                            const runtime = globalUiTemplates.value[templateIndex]?.runtimeByCharacter;
                            if (runtime) delete runtime[characterId];
                        });
                        await Promise.all([
                            saveStoredValue('global_ui_templates', globalUiTemplates.value)
                        ]);
                        await refreshStorageStats();
                        toast(`已清理 ${orphanedItems} 项无用残留，约 ${formatStorageSize(orphanedBytes)}`, 'success');
                    } catch (error) {
                        console.error('Failed to clean unused storage:', error);
                        toast('清理失败，请稍后重试', 'error');
                    } finally {
                        storageStats.cleaning = false;
                    }
                }
            );
        };

        return { cleanupUnusedStorage, formatStorageSize, refreshStorageStats, storageStats };
    };

    window.RPHubComposables = Object.freeze({ useStorageManagement, useTokenUsage });
})();
