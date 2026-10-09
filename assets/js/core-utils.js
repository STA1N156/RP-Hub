// RP-Hub core: shared utilities, character-card parsing and application configuration.

// --- Shared utilities ---
(function () {
const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2U1ZTdlYiIvPjwvc3ZnPg==';

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = Math.random() * 16 | 0;
        const value = character === 'x' ? random : (random & 0x3 | 0x8);
        return value.toString(16);
    });
};

const parseCotCache = new Map();
const parseCot = (text) => {
    if (!text) return { cot: '', rawCot: '', ranges: [], closingTags: '', main: '', isFinished: false };
    if (parseCotCache.has(text)) return parseCotCache.get(text);

    // 重复开标签仍属于分析；只有真正的闭合标签才能放行正文。
    const tokens = /<(html|script|style|ui_template_updates)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)|<!--[\s\S]*?(?:-->|$)|```[\s\S]*?(?:```|$)|`[^`\r\n]*`|<\s*(\/?)\s*(thinking|think|cot)\s*>|<\/?[a-zA-Z][\w:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
    const openTags = [];
    const ranges = [];
    let blockStart = 0;
    let cotContent = '';
    let mainContent = '';
    let cursor = 0;
    let hasCot = false;
    const append = (part) => {
        if (openTags.length) cotContent += part;
        else mainContent += part;
    };
    for (const match of text.matchAll(tokens)) {
        append(text.slice(cursor, match.index));
        if (!match[3]) append(match[0]);
        else {
            const tag = match[3].toLowerCase();
            if (!match[2]) {
                hasCot = true;
                if (!openTags.length) blockStart = match.index;
                if (!openTags.includes(tag)) openTags.push(tag);
                if (cotContent) cotContent += '\n';
            } else if (openTags[openTags.length - 1] === tag) {
                openTags.pop();
                if (!openTags.length) ranges.push({ start: blockStart, end: match.index + match[0].length });
            }
        }
        cursor = match.index + match[0].length;
    }
    // 流式拆开的标签暂不展示，下一段到达后会重新解析完整文本。
    append(text.slice(cursor).replace(/<\s*\/?\s*(?:t|th|thi|thin|think|thinki|thinkin|thinking|c|co|cot)?\s*$/i, ''));

    if (openTags.length) ranges.push({ start: blockStart, end: text.length });
    const rawCot = cotContent.trim();
    const cot = rawCot.split(/(```[\s\S]*?(?:```|$)|`[^`\r\n]*`)/)
        .map((part, index) => index % 2 ? part : part.replace(/</g, '&lt;')).join('');
    const closingTags = [...openTags].reverse().map(tag => `</${tag}>`).join('');
    const result = { cot, rawCot, ranges, closingTags, main: mainContent.trim(), isFinished: hasCot && !openTags.length };
    parseCotCache.set(text, result);
    // Limit cache size to prevent memory leaks in extremely long sessions
    if (parseCotCache.size > 2000) {
        const firstKey = parseCotCache.keys().next().value;
        parseCotCache.delete(firstKey);
    }
    return result;
};

// 后一个 image### 不能作为前一个标签的结尾。
const getImageTagRegex = () => /image###((?:(?!image###|###)[^\r\n])*?)(?:###|(?=\r?\n)|$)/gi;

const compressImage = (source, maxWidth = 300, quality = 0.7) => new Promise((resolve) => {
    const image = new Image();
    image.src = source;
    image.onload = () => {
        const scale = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = () => resolve(source);
});

const readUsageNumber = (...values) => {
    for (const value of values) {
        const number = Number(value);
        if (Number.isFinite(number) && number >= 0) return Math.round(number);
    }
    return null;
};

const getApiUsagePayload = (data) => {
    if (data?.usage && typeof data.usage === 'object') return data.usage;
    if (data?.usageMetadata && typeof data.usageMetadata === 'object') return data.usageMetadata;
    return null;
};


const normalizeApiUsage = (usage) => {
    const source = usage && typeof usage === 'object' ? usage : {};
    const promptDetails = source.prompt_tokens_details || source.input_tokens_details || {};
    const completionDetails = source.completion_tokens_details || source.output_tokens_details || {};
    const cacheReadTokens = readUsageNumber(
        promptDetails.cached_tokens,
        promptDetails.cache_read_tokens,
        source.cache_read_input_tokens,
        source.cache_read_tokens,
        source.cachedContentTokenCount,
        source.cached_content_token_count
    );
    const reportedCacheWriteTokens = readUsageNumber(
        promptDetails.cache_creation_tokens,
        promptDetails.cache_write_tokens,
        source.cache_creation_input_tokens,
        source.cache_creation_tokens,
        source.cache_write_input_tokens,
        source.cache_write_tokens
    );
    const cacheWriteTokens = reportedCacheWriteTokens ?? 0;
    const promptTokens = readUsageNumber(
        source.prompt_tokens,
        source.promptTokenCount,
        source.inputTokenCount
    );
    const nativeInputTokens = readUsageNumber(source.input_tokens);
    const inputTokens = promptTokens !== null
        ? promptTokens
        : nativeInputTokens !== null
            ? nativeInputTokens + (cacheReadTokens || 0) + cacheWriteTokens
            : null;
    const outputTokens = readUsageNumber(
        source.completion_tokens,
        source.output_tokens,
        source.candidatesTokenCount,
        source.outputTokenCount
    );
    const reasoningTokens = readUsageNumber(
        completionDetails.reasoning_tokens,
        source.reasoning_tokens,
        source.thoughtsTokenCount
    );
    let totalTokens = readUsageNumber(source.total_tokens, source.totalTokenCount);
    if (totalTokens === null && (inputTokens !== null || outputTokens !== null)) {
        totalTokens = (inputTokens || 0) + (outputTokens || 0);
    }
    const reported = [inputTokens, outputTokens, totalTokens, cacheReadTokens, reasoningTokens, reportedCacheWriteTokens]
        .some(value => value !== null);
    return { inputTokens, outputTokens, totalTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, reported };
};

const stringifyErrorDetail = (detail) => {
    if (detail === null || detail === undefined) return '';
    if (typeof detail === 'string') return detail;
    try {
        return JSON.stringify(detail, null, 2);
    } catch (_) {
        return String(detail);
    }
};

const getApiErrorStatus = (payload, fallbackStatus) => {
    const candidates = [
        payload?.status,
        payload?.statusCode,
        payload?.code,
        payload?.error?.status,
        payload?.error?.statusCode,
        payload?.error?.code,
        fallbackStatus
    ];
    return candidates.find(value => (
        value !== undefined && value !== null && value !== '' && /^\d+$/.test(String(value))
    )) || '';
};

const formatApiErrorMessage = (status, detail) => {
    const lines = [];
    if (status !== undefined && status !== null && status !== '') lines.push(`API Error: ${status}`);
    lines.push(stringifyErrorDetail(detail).trim() || '请求失败');
    return lines.join('\n');
};

const extractApiErrorMessage = (payload, fallbackStatus = '') => {
    if (!payload || typeof payload !== 'object') return '';
    const error = payload.error;
    const status = getApiErrorStatus(payload, fallbackStatus);
    if (typeof error === 'string') return formatApiErrorMessage(status, error);
    if (error && typeof error === 'object') {
        return formatApiErrorMessage(
            status,
            error.message || error.detail || payload.message || payload.detail || error
        );
    }
    const detail = payload.message || payload.detail;
    return detail ? formatApiErrorMessage(status, detail) : '';
};

// Toast icons name the action the message reports, so call sites only pass a status.
const toastIcons = {
    success: '<path d="M20 6 9 17l-5-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
    wait: '<path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 5v6m4-6v6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    starOff: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
    star: '<path fill="currentColor" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8m0-5v5h-5"/>',
    rename: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    branch: '<path d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9"/>',
    model: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    swap: '<path d="m16 3 4 4-4 4M20 7H4m4 14-4-4 4-4m-4 4h16"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'
};
// First match wins, so the more specific wording comes first.
const toastIconRules = [
    [/正在|稍后|等待/, 'wait'],
    [/复制/, 'copy'],
    [/删除|清空|清理|清除/, 'trash'],
    [/导出/, 'download'],
    [/导入/, 'upload'],
    [/取消收藏/, 'starOff'],
    [/收藏/, 'star'],
    [/图片|生图/, 'image'],
    [/重新生成|重试/, 'refresh'],
    [/改名|重命名/, 'rename'],
    [/分支/, 'branch'],
    [/模型/, 'model'],
    [/中止|停止/, 'stop'],
    [/切换|进入/, 'swap'],
    [/保存/, 'save']
];
const getToastIcon = (message, type = 'info') => {
    // A failure or caution should read as such, whatever the action was.
    if (type === 'error') return toastIcons.error;
    const icon = toastIconRules.find(([pattern]) => pattern.test(String(message)))?.[1];
    if (type === 'warning') return toastIcons[icon === 'wait' ? 'wait' : 'warning'];
    return toastIcons[icon] || toastIcons[type] || toastIcons.info;
};

window.RPHubUtils = {
    compressImage,
    defaultAvatar,
    extractApiErrorMessage,
    formatApiErrorMessage,
    generateUUID,
    getApiUsagePayload,
    getImageTagRegex,
    getToastIcon,
    normalizeApiUsage,
    parseCot,
    stringifyErrorDetail
};
})();

// --- Character-card utilities ---
(function () {
    const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
    const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

    const { imageStyleArtists } = window.RPHubBuiltinContent;
    const getImageStyleArtists = (style, customArtists = '') => {
        if (style === 'custom') return customArtists || '';
        const normalizedStyle = style === 'default' ? 'vertical' : style === 'hentai' ? 'r18' : style;
        return imageStyleArtists[normalizedStyle] || imageStyleArtists.vertical;
    };

    const normalizeNativeReasoningPart = (value) => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(normalizeNativeReasoningPart).join('');
        if (typeof value === 'object') {
            const keys = ['text', 'content', 'summary', 'reasoning', 'reasoning_content', 'thinking', 'thought', 'value'];
            for (const key of keys) {
                const text = normalizeNativeReasoningPart(value[key]);
                if (text) return text;
            }
            return '';
        }
        return String(value);
    };

    const isNativeReasoningPart = part => part?.thought === true
        || /reason|thinking|thought/i.test(String(part?.type || ''));

    const extractNativeReasoning = (source = {}) => {
        if (!source || typeof source !== 'object') return '';
        const directKeys = ['reasoning_content', 'reasoning', 'thinking', 'thinking_content', 'thought', 'thoughts', 'reasoning_text'];
        for (const key of directKeys) {
            const text = normalizeNativeReasoningPart(source[key]);
            if (text) return text;
        }
        if (Array.isArray(source.reasoning_details)) {
            const text = normalizeNativeReasoningPart(source.reasoning_details);
            if (text) return text;
        }
        if (Array.isArray(source.content)) {
            return source.content.filter(isNativeReasoningPart).map(normalizeNativeReasoningPart).join('');
        }
        return '';
    };

    const normalizeRegexModifiers = (pattern, flags = 'g') => {
        let normalizedPattern = pattern;
        let normalizedFlags = flags;
        for (const modifier of ['s', 'i', 'm']) {
            const marker = `(?${modifier})`;
            if (!normalizedPattern.includes(marker)) continue;
            normalizedPattern = normalizedPattern.split(marker).join('');
            if (!normalizedFlags.includes(modifier)) normalizedFlags += modifier;
        }
        return { pattern: normalizedPattern, flags: normalizedFlags };
    };

    const protectedContentPattern = /(<!DOCTYPE html>[\s\S]*?<\/html>|<html\b[^>]*>[\s\S]*?<\/html>|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!DOCTYPE html>[\s\S]*$|<html\b[^>]*>[\s\S]*$|<script\b[^>]*>[\s\S]*$|<style\b[^>]*>[\s\S]*$|<ui_template_updates\b[^>]*>[\s\S]*?(?:<\/ui_template_updates>|$)|<!--[\s\S]*?(?:-->|$)|```[\s\S]*?```|```[\s\S]*$|`[^`]+`|<\/?[a-zA-Z][\w:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*>)/gi;
    const exactProtectedContentPattern = new RegExp('^' + protectedContentPattern.source + '$', 'i');
    const splitProtectedText = (text) => {
        const source = String(text || '');
        const parts = [];
        const appendPlain = value => value.split(protectedContentPattern).forEach(part => {
            if (part) parts.push({ text: part, protected: exactProtectedContentPattern.test(part) });
        });
        let cursor = 0;
        for (const { start, end } of window.RPHubUtils.parseCot(source).ranges) {
            appendPlain(source.slice(cursor, start));
            parts.push({ text: source.slice(start, end), protected: true });
            cursor = end;
        }
        appendPlain(source.slice(cursor));
        return parts;
    };
    const transformUnprotectedText = (text, transform) => splitProtectedText(text)
        .map(part => part.protected ? part.text : transform(part.text))
        .join('');

    const findUnprotectedMatches = (text, pattern, { includeUiTemplateUpdates = false } = {}) => {
        const source = String(text || '');
        let offset = 0;
        const matches = [];
        splitProtectedText(source).forEach(({ text: part, protected: isProtected }) => {
            // 变量解析器只需看到块的开标签；块内 JSON 仍不参与普通匹配。
            const searchable = !isProtected ? part : includeUiTemplateUpdates
                ? (part.match(/^<ui_template_updates\b[^>]*>/i)?.[0] || '') : '';
            if (searchable) {
                const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
                const matcher = new RegExp(pattern.source, flags.replace('y', ''));
                let match;
                while ((match = matcher.exec(searchable)) !== null) {
                    match.index += offset;
                    matches.push(match);
                    if (!match[0]) matcher.lastIndex += 1;
                }
            }
            offset += part.length;
        });
        return matches;
    };
    const findLastUnprotectedMatch = (text, pattern, options) => {
        const match = findUnprotectedMatches(text, pattern, options).pop();
        return match ? { index: match.index, text: match[0] } : null;
    };

    const encodeUtf8 = (value) => {
        if (textEncoder) return textEncoder.encode(String(value ?? ''));
        const encoded = encodeURIComponent(String(value ?? ''));
        const bytes = [];
        for (let i = 0; i < encoded.length; i += 1) {
            if (encoded[i] === '%') {
                bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
                i += 2;
            } else {
                bytes.push(encoded.charCodeAt(i));
            }
        }
        return new Uint8Array(bytes);
    };

    const decodeUtf8 = (bytes) => {
        if (textDecoder) return textDecoder.decode(bytes);
        let encoded = '';
        for (let i = 0; i < bytes.length; i += 1) {
            const hex = bytes[i].toString(16);
            encoded += '%' + (hex.length === 1 ? '0' + hex : hex);
        }
        try {
            return decodeURIComponent(encoded);
        } catch (_) {
            let text = '';
            for (let i = 0; i < bytes.length; i += 1) {
                text += String.fromCharCode(bytes[i]);
            }
            return text;
        }
    };

    const toBytes = (value) => {
        if (value instanceof Uint8Array) return value;
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        if (ArrayBuffer.isView(value)) {
            return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        }
        throw new TypeError('Expected ArrayBuffer or Uint8Array');
    };

    const encodeBase64Utf8 = (value) => {
        const bytes = encodeUtf8(value);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    };

    const decodeBase64Utf8 = (value) => {
        try {
            const binary = atob(String(value || '').trim());
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i);
            }
            return decodeUtf8(bytes);
        } catch (_) {
            return String(value || '');
        }
    };

    const readPngChunks = (buffer) => {
        const bytes = toBytes(buffer);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const chunks = {};
        let offset = 8;

        try {
            while (offset + 8 <= bytes.byteLength) {
                const length = view.getUint32(offset, false);
                const type = String.fromCharCode(
                    view.getUint8(offset + 4),
                    view.getUint8(offset + 5),
                    view.getUint8(offset + 6),
                    view.getUint8(offset + 7)
                );
                const dataStart = offset + 8;
                const dataEnd = dataStart + length;
                if (dataEnd + 4 > bytes.byteLength) break;

                const data = bytes.slice(dataStart, dataEnd);
                if (type === 'tEXt') {
                    const splitIndex = data.indexOf(0);
                    if (splitIndex !== -1) {
                        const key = decodeUtf8(data.slice(0, splitIndex));
                        chunks[key] = decodeUtf8(data.slice(splitIndex + 1));
                    }
                } else if (type === 'iTXt') {
                    let cursor = 0;
                    while (cursor < data.length && data[cursor] !== 0) cursor += 1;
                    const key = decodeUtf8(data.slice(0, cursor));
                    cursor += 1;

                    if (cursor + 2 <= data.length) {
                        const compressionFlag = data[cursor];
                        cursor += 2;
                        while (cursor < data.length && data[cursor] !== 0) cursor += 1;
                        cursor += 1;
                        while (cursor < data.length && data[cursor] !== 0) cursor += 1;
                        cursor += 1;

                        if (key && cursor < data.length && compressionFlag === 0) {
                            chunks[key] = decodeUtf8(data.slice(cursor));
                        }
                    }
                }

                offset += 12 + length;
            }
        } catch (error) {
            console.warn('PNG chunk read failed:', error);
        }

        return chunks;
    };

    const findPngCharacterPayload = (chunks) => {
        if (chunks.chara) return chunks.chara;
        if (chunks.ccv3) return chunks.ccv3;
        return Object.values(chunks).find((value) => {
            const text = String(value || '').trim();
            return text.length > 50 && (text.startsWith('{') || text.startsWith('ey'));
        }) || '';
    };

    const parseCharacterPayload = (payload) => {
        try {
            return JSON.parse(decodeBase64Utf8(payload));
        } catch (_) {
            return JSON.parse(String(payload || ''));
        }
    };

    const parsePngCharacterData = (buffer) => {
        const chunks = readPngChunks(buffer);
        const payload = findPngCharacterPayload(chunks);
        if (!payload) {
            const error = new Error('No character data found in PNG');
            error.chunks = chunks;
            throw error;
        }
        return {
            chunks,
            payload,
            data: parseCharacterPayload(payload)
        };
    };

    const mapExportItems = (items, mapper) => (
        Array.isArray(items) ? items.map((item, index) => mapper(item, index)) : []
    );

    const cloneJsonValue = (value, fallback) => {
        if (value === undefined || value === null) return fallback;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return fallback;
        }
    };

    const toNumber = (value, fallback = null) => {
        if (value === undefined || value === null || value === '') return fallback;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    const toBoolean = (value, fallback = false) => {
        if (value === undefined || value === null || value === '') return fallback;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'true') return true;
            if (normalized === 'false') return false;
        }
        return !!value;
    };

    const normalizeRegexScript = (script = {}, options = {}) => {
        const normalized = { ...script };
        const fallbackScope = options.fallbackScope || 'character';
        const systemNames = Array.isArray(options.systemNames) ? options.systemNames : [];
        if (normalized.disabled !== undefined) normalized.enabled = !normalized.disabled;
        else if (normalized.enabled === undefined) normalized.enabled = true;
        if (!normalized.name && normalized.scriptName) normalized.name = normalized.scriptName;
        if (!normalized.regex && normalized.findRegex) normalized.regex = normalized.findRegex;
        if (!normalized.replacement && normalized.replaceString) normalized.replacement = normalized.replaceString;
        if (!normalized.flags && normalized.regexFlags) normalized.flags = normalized.regexFlags;
        if (!normalized.flags) normalized.flags = 'g';
        if (!Array.isArray(normalized.placement)) normalized.placement = [1, 2];
        if (normalized.markdownOnly === undefined) normalized.markdownOnly = false;
        if (normalized.promptOnly === undefined) normalized.promptOnly = false;
        if (normalized.markdownOnly && normalized.promptOnly) normalized.promptOnly = false;
        if (normalized.runOnEdit === undefined) normalized.runOnEdit = false;
        if (normalized.minDepth === undefined) normalized.minDepth = null;
        if (normalized.maxDepth === undefined) normalized.maxDepth = null;
        normalized.scope = normalized.scope === 'global'
            || fallbackScope === 'global'
            || systemNames.includes(normalized.name || normalized.scriptName)
            ? 'global'
            : 'character';
        delete normalized.disabled;
        return normalized;
    };

    const normalizeImportedRegexScript = (script = {}, options = {}) => {
        const normalized = { ...script };
        if (!normalized.name) normalized.name = normalized.scriptName || 'Regex Script';
        if (!normalized.regex) normalized.regex = normalized.findRegex || '';
        if (normalized.regex.startsWith('/') && normalized.regex.lastIndexOf('/') > 0) {
            const lastSlash = normalized.regex.lastIndexOf('/');
            const possibleFlags = normalized.regex.slice(lastSlash + 1);
            if (/^[gimsuy]*$/.test(possibleFlags)) {
                normalized.flags = possibleFlags;
                normalized.regex = normalized.regex.slice(1, lastSlash);
            }
        }
        if (!normalized.replacement && normalized.replaceString) normalized.replacement = normalized.replaceString;
        if (!normalized.flags) normalized.flags = normalized.regexFlags || 'g';
        if (!normalized.placement) normalized.placement = script.placement || [1, 2];
        if (normalized.markdownOnly === undefined) normalized.markdownOnly = script.markdownOnly || false;
        if (normalized.promptOnly === undefined) normalized.promptOnly = script.promptOnly || false;
        if (normalized.runOnEdit === undefined) normalized.runOnEdit = script.runOnEdit || false;
        if (normalized.minDepth === undefined) normalized.minDepth = script.minDepth || null;
        if (normalized.maxDepth === undefined) normalized.maxDepth = script.maxDepth || null;
        return normalizeRegexScript(normalized, options);
    };

    const normalizeWorldInfoEntry = (entry = {}, options = {}) => {
        const mergedEntry = { ...entry };
        Object.entries(entry.extensions || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null) mergedEntry[key] = value;
        });
        delete mergedEntry.extensions;
        const systemNames = Array.isArray(options.systemNames) ? options.systemNames : [];
        const normalizeBoolean = (value, fallback) => {
            if (value === undefined || value === null) return fallback;
            if (typeof value === 'string') {
                if (value.toLowerCase() === 'false') return false;
                if (value.toLowerCase() === 'true') return true;
            }
            return !!value;
        };
        const getValue = (keys, fallback) => {
            for (const key of keys) {
                if (mergedEntry[key] !== undefined && mergedEntry[key] !== null) return mergedEntry[key];
            }
            return fallback;
        };

        let keys = mergedEntry.keys || mergedEntry.key || [];
        if (typeof keys === 'string') keys = keys.split(/[,，]/).map(key => key.trim()).filter(Boolean);
        else if (!Array.isArray(keys)) keys = [];

        const validPositions = ['system_top', 'global_note', 'before_char', 'after_char', 'at_depth', 'user_top', 'assistant_top'];
        const positionAliases = {
            before_character: 'before_char',
            after_character: 'after_char',
            character_top: 'before_char',
            character_bottom: 'after_char',
            before_examples: 'before_char',
            after_examples: 'after_char',
            example_top: 'before_char',
            example_bottom: 'after_char',
            an_top: 'global_note',
            author_note: 'global_note',
            an_bottom: 'global_note'
        };
        let position = 'at_depth';
        const rawPosition = mergedEntry.position;
        if (typeof rawPosition === 'string') {
            const normalizedPosition = rawPosition.toLowerCase().replace(/ /g, '_');
            const mappedPosition = positionAliases[normalizedPosition] || normalizedPosition;
            if (validPositions.includes(mappedPosition)) position = mappedPosition;
        } else if (typeof rawPosition === 'number') {
            position = ({ 0: 'before_char', 1: 'after_char', 2: 'global_note', 3: 'global_note', 4: 'at_depth' })[rawPosition]
                || 'at_depth';
        }

        const comment = getValue(['comment'], '');
        return {
            comment,
            content: getValue(['content'], ''),
            enabled: normalizeBoolean(getValue(['enabled'], true), true)
                && !normalizeBoolean(getValue(['disable', 'disabled'], false), false),
            scope: systemNames.includes(comment) || getValue(['scope'], 'character') === 'global' ? 'global' : 'character',
            keys,
            useRegex: normalizeBoolean(getValue(['use_regex', 'useRegex'], false), false),
            constant: normalizeBoolean(getValue(['constant'], false), false),
            position,
            order: toNumber(getValue(['insertion_order', 'order'], 0), 0),
            depth: toNumber(getValue(['depth'], 4), 4),
            scanDepth: toNumber(getValue(['scan_depth', 'scanDepth'], null), null),
            probability: toNumber(getValue(['probability'], 100), 100),
            useProbability: normalizeBoolean(getValue(['useProbability', 'use_probability'], true), true)
        };
    };

    const parseWorldInfoKeysText = (text, preserveRegex = false) => {
        const rawText = String(text || '');
        if (!preserveRegex) return rawText.split(/[,，]/).map(key => key.trim()).filter(Boolean);

        const parts = [];
        let current = '';
        let inRegex = false;
        let inClass = false;
        let escaped = false;
        for (const character of rawText) {
            if (escaped) {
                current += character;
                escaped = false;
            } else if (inRegex) {
                current += character;
                if (character === '\\') escaped = true;
                else if (character === '[') inClass = true;
                else if (character === ']') inClass = false;
                else if (character === '/' && !inClass) inRegex = false;
            } else if (character === ',' || character === '，') {
                parts.push(current);
                current = '';
            } else {
                if (character === '/' && !current.trim()) inRegex = true;
                current += character;
            }
        }
        parts.push(current);
        return parts.map(key => key.trim()).filter(Boolean);
    };

    const parseImportedCharacterCard = (rawData = {}) => {
        const source = rawData && typeof rawData === 'object' ? rawData : {};
        const character = source.data && typeof source.data === 'object' ? source.data : source;
        const characterBook = character.character_book || source.character_book || null;
        const regexScripts = character.extensions?.regex_scripts
            || source.extensions?.regex_scripts
            || character.regex_scripts
            || source.regex_scripts
            || [];
        const uiTemplates = character.uiTemplates
            || character.ui_templates
            || source.uiTemplates
            || source.ui_templates
            || character.extensions?.ui_templates
            || character.extensions?.rp_hub_ui_templates
            || source.extensions?.ui_templates
            || source.extensions?.rp_hub_ui_templates
            || [];

        let worldInfoEntries = [];
        if (Array.isArray(characterBook?.entries)) worldInfoEntries = characterBook.entries;
        else if (characterBook?.entries && typeof characterBook.entries === 'object') {
            worldInfoEntries = Object.values(characterBook.entries);
        } else if (Array.isArray(characterBook)) worldInfoEntries = characterBook;

        return {
            name: character.name || character.char_name || 'Unknown',
            description: character.description || character.char_persona || '',
            personality: character.personality || '',
            first_mes: character.first_mes || '',
            creator_notes: character.creator_notes || character.creatorcomment || character.creator_comment || '',
            regexScripts: Array.isArray(regexScripts) ? regexScripts : [],
            uiTemplates: Array.isArray(uiTemplates) ? uiTemplates : [],
            worldInfoEntries
        };
    };

    const toWorldInfoExportEntry = (entry = {}) => ({
        comment: entry.comment || entry.name || '',
        content: entry.content || '',
        enabled: toBoolean(entry.enabled, true),
        scope: entry.scope || 'character',
        keys: Array.isArray(entry.keys) ? entry.keys : [],
        useRegex: toBoolean(entry.useRegex, false),
        constant: toBoolean(entry.constant, false),
        position: entry.position || 'at_depth',
        order: toNumber(entry.order, 0),
        depth: toNumber(entry.depth, 4),
        scanDepth: toNumber(entry.scanDepth, null),
        probability: toNumber(entry.probability, 100),
        useProbability: toBoolean(entry.useProbability, true)
    });

    const toRegexExportEntry = (script = {}) => {
        const placement = Array.isArray(script.placement)
            ? script.placement.map(Number).filter(value => value === 1 || value === 2)
            : [1, 2];
        const markdownOnly = toBoolean(script.markdownOnly, false);
        const promptOnly = markdownOnly ? false : toBoolean(script.promptOnly, false);

        return {
            name: script.name || script.scriptName || '',
            regex: script.regex || script.findRegex || '',
            flags: script.flags || script.regexFlags || 'g',
            replacement: script.replacement !== undefined ? script.replacement : (script.replaceString || ''),
            placement: placement.length ? placement : [2],
            markdownOnly,
            promptOnly,
            runOnEdit: toBoolean(script.runOnEdit, false),
            minDepth: toNumber(script.minDepth, null),
            maxDepth: toNumber(script.maxDepth, null),
            scope: script.scope || 'character',
            disabled: script.disabled !== undefined
                ? toBoolean(script.disabled, false)
                : !toBoolean(script.enabled, true)
        };
    };

    const toUiTemplateExportEntry = (template = {}, options = {}) => {
        const variableState = cloneJsonValue(template.variableState, {});
        return {
            id: template.id,
            name: template.name || 'UI模板',
            enabled: template.enabled !== false,
            scope: options.scope || template.scope || 'character',
            order: toNumber(template.order, 100),
            placement: ['top', 'bottom'].includes(template.placement) ? template.placement : 'bottom',
            htmlTemplate: template.htmlTemplate || template.template || '',
            initialVariableState: cloneJsonValue(template.initialVariableState, variableState),
            variableSchema: (typeof template.variableSchema === 'string' || typeof template.variableSchema === 'object')
                ? cloneJsonValue(template.variableSchema, template.variableSchema)
                : '',
            updateMode: template.updateMode || 'merge'
        };
    };

    const buildCharacterCardData = (character = {}, options = {}) => {
        const worldInfoMapper = options.worldInfoMapper || toWorldInfoExportEntry;
        const regexScriptMapper = options.regexScriptMapper || toRegexExportEntry;
        const uiTemplateMapper = options.uiTemplateMapper || toUiTemplateExportEntry;
        const includeUiTemplates = options.includeUiTemplates !== false;
        const worldEntries = mapExportItems(
            character.worldInfo,
            worldInfoMapper
        );
        const regexScripts = mapExportItems(
            character.regexScripts,
            regexScriptMapper
        );
        const uiTemplates = includeUiTemplates
            ? mapExportItems(character.uiTemplates, uiTemplateMapper)
            : [];

        const data = {
            name: character.name,
            description: character.description,
            personality: character.personality,
            first_mes: character.first_mes,
            creator_notes: character.creator_notes || 'Exported from RolePlay Hub',
            ...(includeUiTemplates ? { uiTemplates } : {}),
            extensions: {
                rp_hub_watermark: 'rp-hub',
                regex_scripts: regexScripts,
                ...(includeUiTemplates ? { rp_hub_ui_templates: uiTemplates } : {})
            },
            character_book: worldEntries.length > 0 ? { entries: worldEntries } : undefined
        };

        return { data };
    };

    const crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let k = 0; k < 8; k += 1) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crc32Table[i] = c;
    }

    const crc32 = (bytes) => {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i += 1) {
            crc = (crc >>> 8) ^ crc32Table[(crc ^ bytes[i]) & 0xFF];
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    };

    const createTextChunk = (key, value) => {
        const type = encodeUtf8('tEXt');
        const keyData = encodeUtf8(key);
        const valueData = encodeUtf8(value);
        const chunkData = new Uint8Array(keyData.length + 1 + valueData.length);
        chunkData.set(keyData, 0);
        chunkData[keyData.length] = 0;
        chunkData.set(valueData, keyData.length + 1);

        const crcInput = new Uint8Array(type.length + chunkData.length);
        crcInput.set(type, 0);
        crcInput.set(chunkData, type.length);

        const fullChunk = new Uint8Array(12 + chunkData.length);
        const view = new DataView(fullChunk.buffer);
        view.setUint32(0, chunkData.length, false);
        fullChunk.set(type, 4);
        fullChunk.set(chunkData, 8);
        view.setUint32(8 + chunkData.length, crc32(crcInput), false);
        return fullChunk;
    };

    const injectPngTextChunk = (pngBuffer, key, value) => {
        const pngBytes = toBytes(pngBuffer);
        const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
        const textChunk = createTextChunk(key, value);
        let insertPos = 33;
        let offset = 8;

        while (offset + 8 <= pngBytes.byteLength) {
            const length = view.getUint32(offset, false);
            const type = String.fromCharCode(
                view.getUint8(offset + 4),
                view.getUint8(offset + 5),
                view.getUint8(offset + 6),
                view.getUint8(offset + 7)
            );
            const nextOffset = offset + 12 + length;
            if (type === 'IHDR') {
                insertPos = nextOffset;
                break;
            }
            offset = nextOffset;
        }

        const result = new Uint8Array(pngBytes.length + textChunk.length);
        result.set(pngBytes.slice(0, insertPos), 0);
        result.set(textChunk, insertPos);
        result.set(pngBytes.slice(insertPos), insertPos + textChunk.length);
        return result;
    };

    const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

    const imageUrlToPngBytes = (src, options = {}) => new Promise((resolve, reject) => {
        const img = new Image();
        if (options.crossOrigin !== undefined && options.crossOrigin !== null) {
            img.crossOrigin = options.crossOrigin;
        }
        if (options.referrerPolicy) {
            img.referrerPolicy = options.referrerPolicy;
        }
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    reject(new Error('Could not create PNG blob'));
                    return;
                }
                try {
                    resolve(new Uint8Array(await blob.arrayBuffer()));
                } catch (error) {
                    reject(error);
                }
            }, 'image/png');
        };
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = src;
    });

    const downloadBlob = (blob, filename, options = {}) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        if (options.targetBlank) a.target = '_blank';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        const cleanup = () => {
            if (a.parentNode) a.parentNode.removeChild(a);
            URL.revokeObjectURL(url);
        };
        const delay = Number(options.revokeDelay || 0);
        if (delay > 0) {
            setTimeout(cleanup, delay);
        } else {
            cleanup();
        }
    };

    window.RPHubCardUtils = {
        blobToDataUrl,
        buildCharacterCardData,
        decodeBase64Utf8,
        downloadBlob,
        encodeBase64Utf8,
        extractNativeReasoning,
        findPngCharacterPayload,
        findLastUnprotectedMatch,
        findUnprotectedMatches,
        isNativeReasoningPart,
        getImageStyleArtists,
        imageUrlToPngBytes,
        injectPngTextChunk,
        normalizeImportedRegexScript,
        normalizeRegexScript,
        normalizeRegexModifiers,
        normalizeWorldInfoEntry,
        parseImportedCharacterCard,
        parseCharacterPayload,
        parseWorldInfoKeysText,
        parsePngCharacterData,
        readPngChunks,
        toBoolean,
        toNumber,
        toRegexExportEntry,
        toUiTemplateExportEntry,
        toWorldInfoExportEntry,
        transformUnprotectedText
    };
})();

// --- Application configuration ---
(function () {
    window.RPHubConfig = Object.freeze({
        systemRegexNames: Object.freeze(['NAI画图正则']),
        systemWorldInfoNames: Object.freeze(['自动生图']),
        imageGenBaseUrl: 'https://nai.sta1n.cn',
        defaultApiProviderId: 'sta1n',
        defaultApiConfig: Object.freeze({
            apiUrl: 'https://cdn.sta1n.cn/v1',
            apiKey: '',
            model: '',
            qualityModel: '',
            balancedModel: '',
            fastModel: ''
        }),
        apiProviderOptions: Object.freeze([
            Object.freeze({
                id: 'sta1n',
                name: 'STA1N API',
                apiUrl: 'https://cdn.sta1n.cn/v1',
                icon: 'https://img.cdn1.vip/i/6a11f4d96fa99_1779561689.webp'
            }),
            Object.freeze({
                id: 'deepseek',
                name: 'DeepSeek',
                apiUrl: 'https://api.deepseek.com/v1',
                icon: 'https://www.deepseek.com/favicon.ico'
            }),
            Object.freeze({
                id: 'openrouter',
                name: 'OpenRouter',
                apiUrl: 'https://openrouter.ai/api/v1',
                icon: 'https://openrouter.ai/favicon.ico'
            }),
            Object.freeze({
                id: 'siliconflow',
                name: 'SiliconFlow',
                apiUrl: 'https://api.siliconflow.cn/v1',
                icon: 'https://siliconflow.cn/favicon.ico'
            })
        ]),
        activeTools: window.RPHubBuiltinContent.activeTools,
        uiOptions: Object.freeze({
            popularModelFamilies: Object.freeze(['claude', 'gemini', 'deepseek', 'llama', 'glm', 'moonshot', 'grok']),
            presetRoles: Object.freeze([
                { value: 'system', label: '系统提示词' },
                { value: 'user', label: 'User消息' },
                { value: 'assistant', label: 'AI消息' }
            ]),
            presetRoleDisplayLabels: Object.freeze({ system: '系统', user: 'User', assistant: 'AI' }),
            fontSizes: Object.freeze([12, 13, 14, 15, 16, 17, 18, 19, 20].map(size => ({
                value: size,
                label: `${size}px`
            }))),
            imageStyles: Object.freeze([
                { value: 'vertical', label: '韩漫小清新风' },
                { value: 'comicDoujin', label: '动漫同人风' },
                { value: 'r18', label: '2.5D唯美风' },
                { value: 'lolita25d', label: '2.5D唯美风（萝）' },
                { value: 'anime', label: '本子里番风' },
                { value: 'galgame', label: 'GalGame风' },
                { value: 'custom', label: '自定义' }
            ]),
            imageModels: Object.freeze([
                { value: 'nai-diffusion-4-5-full', label: 'V4.5 完整版（-1）' },
                { value: 'nai-diffusion-5-full', label: 'V5 完整版（-8）' }
            ]),
            imageSizes: Object.freeze([
                { value: '竖图', label: '竖图' },
                { value: '横图', label: '横图' },
                { value: '方图', label: '方图' }
            ]),
            imageCounts: Object.freeze([2, 3, 4, 5, 6, 7, 8].map(count => ({
                value: count,
                label: `${count} 张`
            }))),
            uiTemplatePlacements: Object.freeze([
                { value: 'top', label: '对话顶部' },
                { value: 'bottom', label: '对话底部' }
            ]),
            worldInfoPositions: Object.freeze([
                { group: '系统提示词', value: 'system_top', label: '最顶层' },
                { group: '系统提示词', value: 'global_note', label: '全局备注' },
                { group: '系统提示词', value: 'before_char', label: '角色设定前' },
                { group: '系统提示词', value: 'after_char', label: '角色设定后' },
                { group: '对话中', value: 'at_depth', label: '按深度插入' },
                { group: '对话中', value: 'user_top', label: '用户消息顶部' },
                { group: '对话中', value: 'assistant_top', label: '助手消息顶部' }
            ])
        }),
        latestUpdate: window.RPHubLatestUpdate
    });
})();
