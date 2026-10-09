// RP-Hub data services: storage, memory, context, branches and UI-template state.

// --- Storage ---
(function () {
    const DB_NAME = 'RPHubDB';
    const LEGACY_DB_NAME = String.fromCharCode(83, 105, 108, 108, 121, 84, 97, 118, 101, 114, 110, 68, 66);
    const STORAGE_PREFIX = 'rp_hub_';
    const LEGACY_STORAGE_PREFIX = String.fromCharCode(115, 105, 108, 108, 121, 95, 116, 97, 118, 101, 114, 110, 95);
    const DB_VERSION = 1;
    let mainDb = null;
    let legacyDb = null;
    let initPromise = null;

    const openAppDB = (name, version = DB_VERSION) => new Promise((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onerror = (event) => reject(`DB Error: ${event.target.error}`);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains('store')) database.createObjectStore('store');
        };
    });

    const initDB = async () => {
        if (mainDb) return mainDb;
        if (initPromise) return initPromise;
        initPromise = (async () => {
            mainDb = await openAppDB(DB_NAME);
            try {
                const dbList = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : null;
                const legacyInfo = dbList?.find(item => item?.name === LEGACY_DB_NAME);
                const shouldOpenLegacy = !dbList || !!legacyInfo;
                if (shouldOpenLegacy) {
                    const legacyVersion = Math.max(DB_VERSION, Number(legacyInfo?.version) || DB_VERSION);
                    legacyDb = await openAppDB(LEGACY_DB_NAME, legacyVersion);
                }
            } catch (error) {
                console.warn('Legacy DB check failed:', error);
            }
            return mainDb;
        })();
        try {
            return await initPromise;
        } finally {
            initPromise = null;
        }
    };

    const isDatabaseClosingError = (error) => {
        const message = String(error?.message || error || '');
        return /connection is closing|database is closing|close pending/i.test(message);
    };

    const reopenMainDB = async () => {
        try { mainDb?.close(); } catch (_) { }
        mainDb = await openAppDB(DB_NAME);
        return mainDb;
    };

    const unwrapForStorage = (value, seen = new WeakMap()) => {
        if (value === null || typeof value !== 'object') return value;
        const raw = typeof Vue?.toRaw === 'function' ? Vue.toRaw(value) : value;
        if (raw === null || typeof raw !== 'object') return raw;
        if (seen.has(raw)) return seen.get(raw);
        if (raw instanceof Date) return raw.toISOString();
        if (ArrayBuffer.isView(raw)) return Array.from(raw);
        if (raw instanceof ArrayBuffer) return Array.from(new Uint8Array(raw));

        if (Array.isArray(raw)) {
            const result = [];
            seen.set(raw, result);
            raw.forEach((item, index) => {
                const clonedItem = unwrapForStorage(item, seen);
                result[index] = clonedItem === undefined ? null : clonedItem;
            });
            return result;
        }

        const result = {};
        seen.set(raw, result);
        Object.keys(raw).forEach(key => {
            const item = raw[key];
            if (typeof item === 'function' || typeof item === 'undefined') return;
            result[key] = unwrapForStorage(item, seen);
        });
        return result;
    };

    const cloneForStorage = (value) => {
        const plainValue = unwrapForStorage(value);
        if (typeof structuredClone === 'function') {
            try { return structuredClone(plainValue); } catch (_) { }
        }
        return JSON.parse(JSON.stringify(plainValue));
    };

    const storageKey = (name) => `${STORAGE_PREFIX}${name}`;
    const legacyStorageKey = (name) => `${LEGACY_STORAGE_PREFIX}${name}`;
    const scopedStorageKey = (name, id) => `${storageKey(name)}_${id}`;
    const legacyScopedStorageKey = (name, id) => `${legacyStorageKey(name)}_${id}`;

    const dbSetTo = (targetDb, key, value, options = {}) => new Promise((resolve, reject) => {
        if (!targetDb) return reject('DB not initialized');
        const request = targetDb.transaction(['store'], 'readwrite')
            .objectStore('store')
            .put(options.clone === false ? value : cloneForStorage(value), key);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });

    const dbSet = async (key, value, options = {}) => {
        if (!mainDb) await initDB();
        try {
            return await dbSetTo(mainDb, key, value, options);
        } catch (error) {
            if (!isDatabaseClosingError(error)) throw error;
            await reopenMainDB();
            return dbSetTo(mainDb, key, value, options);
        }
    };

    const dbGetFrom = (targetDb, key) => new Promise((resolve, reject) => {
        if (!targetDb) return resolve(undefined);
        const request = targetDb.transaction(['store'], 'readonly').objectStore('store').get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });

    const dbGet = async (key) => {
        if (!mainDb) await initDB();
        try {
            return await dbGetFrom(mainDb, key);
        } catch (error) {
            if (!isDatabaseClosingError(error)) throw error;
            await reopenMainDB();
            return dbGetFrom(mainDb, key);
        }
    };

    const dbGetWithLegacy = async (key, oldKey) => {
        const value = await dbGet(key);
        if (value !== undefined || !oldKey || !legacyDb) return value;
        const legacyValue = await dbGetFrom(legacyDb, oldKey);
        if (legacyValue !== undefined) await dbSet(key, legacyValue);
        return legacyValue;
    };

    const dbDeleteFrom = (targetDb, key) => new Promise((resolve, reject) => {
        if (!targetDb) return resolve();
        const request = targetDb.transaction(['store'], 'readwrite').objectStore('store').delete(key);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });

    const dbDeleteWithLegacy = async (key, oldKey) => {
        if (!mainDb) await initDB();
        await dbDeleteFrom(mainDb, key);
        if (oldKey && legacyDb) await dbDeleteFrom(legacyDb, oldKey);
    };

    const readStorageKeys = (targetDb) => new Promise((resolve, reject) => {
        if (!targetDb) return resolve([]);
        const request = targetDb.transaction(['store'], 'readonly').objectStore('store').getAllKeys();
        request.onsuccess = () => resolve(request.result.map(key => String(key)));
        request.onerror = () => reject(request.error);
    });

    const scanStorageEntries = (targetDb, source, inspect) => new Promise((resolve, reject) => {
        if (!targetDb) return resolve();
        const request = targetDb.transaction(['store'], 'readonly').objectStore('store').openCursor();
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return resolve();
            inspect(source, String(cursor.key), cursor.value);
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });

    const deleteStorageKeys = (targetDb, keys) => new Promise((resolve, reject) => {
        if (!targetDb || keys.length === 0) return resolve();
        const transaction = targetDb.transaction(['store'], 'readwrite');
        const store = transaction.objectStore('store');
        keys.forEach(key => store.delete(key));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });

    const getStorageLogicalKey = (key) => {
        const value = String(key || '');
        if (value.startsWith(STORAGE_PREFIX)) return value.slice(STORAGE_PREFIX.length);
        if (value.startsWith(LEGACY_STORAGE_PREFIX)) return value.slice(LEGACY_STORAGE_PREFIX.length);
        return value;
    };

    window.RPHubStorage = Object.freeze({
        cloneForStorage,
        deleteScopedStoredValue: (name, id) => dbDeleteWithLegacy(scopedStorageKey(name, id), legacyScopedStorageKey(name, id)),
        deleteStorageKeys,
        deleteStoredValue: (name) => dbDeleteWithLegacy(storageKey(name), legacyStorageKey(name)),
        getLegacyDb: () => legacyDb,
        getMainDb: () => mainDb,
        getScopedStoredValue: (name, id) => dbGetWithLegacy(scopedStorageKey(name, id), legacyScopedStorageKey(name, id)),
        getStoredValue: (name) => dbGetWithLegacy(storageKey(name), legacyStorageKey(name)),
        getStorageLogicalKey,
        initDB,
        isDatabaseClosingError,
        readStorageKeys,
        scanStorageEntries,
        setScopedStoredValue: (name, id, value, options = {}) => dbSet(scopedStorageKey(name, id), value, options),
        setStoredValue: (name, value, options = {}) => dbSet(storageKey(name), value, options),
        unwrapForStorage
    });
})();

// --- Shared summary memory utilities ---
(function () {
    const isEmbeddingLike = value => Array.isArray(value) || ArrayBuffer.isView(value);
    const markRuntimeRaw = (value) => {
        if (!value || typeof value !== 'object') return value;
        return typeof Vue?.markRaw === 'function' ? Vue.markRaw(value) : value;
    };


    const bytesToBase64 = (bytes) => {
        const source = bytes instanceof Uint8Array
            ? bytes
            : new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < source.length; i += chunkSize) {
            binary += String.fromCharCode(...source.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    };

    const base64ToInt8Array = (base64) => {
        const binary = atob(String(base64 || ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Int8Array(bytes.buffer);
    };

    const quantizeEmbeddingForStorage = (embedding) => {
        if (!isEmbeddingLike(embedding) || embedding.length === 0) return null;
        let maxAbs = 0;
        for (let i = 0; i < embedding.length; i++) {
            const value = Math.abs(Number(embedding[i]) || 0);
            if (value > maxAbs) maxAbs = value;
        }
        if (maxAbs <= 0) return null;

        const quantized = new Int8Array(embedding.length);
        for (let i = 0; i < embedding.length; i++) {
            const scaled = Math.round(((Number(embedding[i]) || 0) / maxAbs) * 127);
            quantized[i] = Math.max(-127, Math.min(127, scaled));
        }

        return {
            embeddingQ: bytesToBase64(new Uint8Array(quantized.buffer)),
            embeddingScale: maxAbs / 127,
            embeddingDims: embedding.length,
            embeddingEncoding: 'int8:maxabs:v1'
        };
    };


    const normalizeClassicMemoryForRuntime = (memory, includeSources = true) => {
        if (memory?.classicMemory !== true || !String(memory.summary || '').trim()) return null;
        const { storyTime: _storedStoryTime, ...memoryData } = memory;
        const fallbackTurn = Math.max(1, Number(memory.turn) || 1);
        const secondaryCompressed = memory.secondaryCompressed === true;
        const turnStart = secondaryCompressed
            ? Math.max(1, Number(memory.turnStart) || fallbackTurn)
            : fallbackTurn;
        const turnEnd = secondaryCompressed
            ? Math.max(turnStart, Number(memory.turnEnd) || fallbackTurn)
            : fallbackTurn;
        const normalized = {
            ...memoryData,
            turn: secondaryCompressed ? turnEnd : fallbackTurn,
            summary: String(memory.summary || '').trim(),
            sourceUserIds: Array.isArray(memory.sourceUserIds) ? memory.sourceUserIds.filter(Boolean) : [],
            sourceAssistantIds: Array.isArray(memory.sourceAssistantIds) ? memory.sourceAssistantIds.filter(Boolean) : []
        };
        if (secondaryCompressed) {
            normalized.secondaryCompressed = true;
            normalized.turnStart = turnStart;
            normalized.turnEnd = turnEnd;
            normalized.sourceMemories = includeSources && Array.isArray(memory.sourceMemories)
                ? memory.sourceMemories.map(item => normalizeClassicMemoryForRuntime(item, false)).filter(Boolean)
                : [];
        }
        return markRuntimeRaw(normalized);
    };

    const prepareClassicMemoriesForRuntime = (items) => Array.isArray(items)
        ? items.map(memory => normalizeClassicMemoryForRuntime(memory)).filter(Boolean)
        : [];

    // 每条总结记忆有一个持久编号（显示为 M编号），上下文、召回和正文引用共用；旧数据按轮次顺序补号。
    const flattenClassicMemories = items => (Array.isArray(items) ? items : [])
        .flatMap(memory => [...(memory?.sourceMemories || []), memory]);
    const getNextClassicMemoryNo = items => flattenClassicMemories(items)
        .reduce((max, memory) => Math.max(max, Number.isInteger(memory?.no) ? memory.no : 0), 0) + 1;
    const numberClassicMemories = items => {
        let next = getNextClassicMemoryNo(items);
        flattenClassicMemories(items)
            .filter(memory => memory && !Number.isInteger(memory.no))
            .sort((a, b) => (a.secondaryCompressed === true) - (b.secondaryCompressed === true)
                || (Number(a.turnStart || a.turn) || 0) - (Number(b.turnStart || b.turn) || 0)
                || (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0))
            .forEach(memory => { memory.no = next++; });
        return items;
    };


    const trimMemoryText = (text, maxLength = 1800) => {
        const cleanText = String(text || '').replace(/\n{3,}/g, '\n\n').trim();
        return cleanText.length <= maxLength ? cleanText : `${cleanText.slice(0, maxLength)}...`;
    };

    const getClassicMemoryKey = (sourceAssistantIds, turn = 0) => {
        const ids = Array.isArray(sourceAssistantIds) ? sourceAssistantIds.filter(Boolean) : [];
        return ids.length > 0 ? ids.join('|') : `turn:${Number(turn) || 0}`;
    };


    const normalizeEmbedding = embedding => {
        const values = isEmbeddingLike(embedding) ? Array.from(embedding) : [];
        return values.length && values.every(value => typeof value === 'number' && Number.isFinite(value))
            ? values : [];
    };

    const cosineSimilarity = (a, b) => {
        if (!isEmbeddingLike(a) || !isEmbeddingLike(b) || !a.length || a.length !== b.length) return -1;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return normA && normB ? dot / Math.sqrt(normA * normB) : -1;
    };

    // 二次压缩仍保留逐轮总结；增强模式只索引这些基础总结。
    const getSummarySources = items => (Array.isArray(items) ? items : []).flatMap(memory => {
        if (memory?.enabled === false) return [];
        return memory?.secondaryCompressed
            ? getSummarySources(memory.sourceMemories)
            : memory?.classicMemory && memory.summary ? [memory] : [];
    });

    const embeddingCache = new WeakMap();
    const getSummaryEmbedding = memory => {
        if (!memory?.embeddingQ) return [];
        const cached = embeddingCache.get(memory);
        if (cached?.encoded === memory.embeddingQ) return cached.value;
        try {
            const value = base64ToInt8Array(memory.embeddingQ);
            if (value.length !== memory.embeddingDims) return [];
            embeddingCache.set(memory, { encoded: memory.embeddingQ, value });
            return value;
        } catch (_) {
            return [];
        }
    };

    const buildSummaryEmbeddingText = memory =>
        `用户原输入：\n${memory.sourceUserText || ''}\n\n本轮总结：\n${memory.summary || ''}`;

    window.RPHubMemoryUtils = Object.freeze({
        buildSummaryEmbeddingText,
        cosineSimilarity,
        flattenClassicMemories,
        getClassicMemoryKey,
        getNextClassicMemoryNo,
        getSummaryEmbedding,
        getSummarySources,
        markRuntimeRaw,
        normalizeEmbedding,
        numberClassicMemories,
        prepareClassicMemoriesForRuntime,
        quantizeEmbeddingForStorage,
        trimMemoryText
    });
})();

// --- Context utilities ---
(function () {
    const { prompts: BUILTIN_PROMPTS } = window.RPHubBuiltinContent;
    const escapeXmlAttribute = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const escapeXmlText = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const indentXmlText = (text, spaces = 0) => {
        const prefix = ' '.repeat(Math.max(0, spaces));
        return String(text || '')
            .split(/\r?\n/)
            .map(line => `${prefix}${line}`)
            .join('\n');
    };

    const isRoleMemoryContextContent = content => String(content || '').trimStart().startsWith('[角色记忆');

    const appendEnhancedMemoryRecall = (messages, memories) => {
        if (!memories.length) return messages;
        let index = messages.length - 1;
        while (index >= 0 && (messages[index].role !== 'user' || messages[index].tool_calls)) index--;
        if (index < 0) return messages;
        const block = [
            '<enhanced_memory_recall>',
            ...BUILTIN_PROMPTS.enhancedMemoryRecallDescription,
            ...memories.map(memory => [
                `  <memory_fragment id="M${escapeXmlAttribute(memory.no)}" turn="${escapeXmlAttribute(memory.turn)}" similarity="${(memory.score * 100).toFixed(1)}%">`,
                `    <user_input>${escapeXmlText(memory.sourceUserText)}</user_input>`,
                `    <summary>${escapeXmlText(memory.summary)}</summary>`,
                '  </memory_fragment>'
            ].join('\n')),
            '</enhanced_memory_recall>'
        ].join('\n');
        return messages.map((message, messageIndex) => messageIndex === index
            ? { ...message, content: `${message.content}\n\n${block}`, _enhancedMemoryRecallCount: memories.length }
            : message);
    };

    const getMessageSourceIndexes = (message, index, trackSources) => {
        const source = message?._sourceIndexes;
        if (!Array.isArray(source)) return trackSources ? [index] : [];
        return [...source];
    };

    const toPlainContextMessage = (message, index, trackSources = false) => {
        const nextMessage = {
            role: message.role,
            name: message.name,
            content: String(message.content || '')
        };
        if (message.id) nextMessage.id = message.id;
        if (Number.isFinite(message._contextFloor)) nextMessage._contextFloor = message._contextFloor;
        if (message._preventContextMerge === true) nextMessage._preventContextMerge = true;
        if (message._classicMemory === true) nextMessage._classicMemory = true;
        if (trackSources) nextMessage._sourceIndexes = getMessageSourceIndexes(message, index, true);
        else if (Array.isArray(message?._sourceIndexes)) nextMessage._sourceIndexes = getMessageSourceIndexes(message, index, false);
        if (Array.isArray(message?._worldInfoEntries)) nextMessage._worldInfoEntries = message._worldInfoEntries;
        return nextMessage;
    };

    const mergeConsecutiveRoleMessages = (messages, options = {}) => {
        const {
            mergeRoles = ['user', 'assistant'],
            includeSystem = true,
            trackSources = false
        } = options;
        const mergeRoleSet = new Set(mergeRoles);
        const merged = [];
        (Array.isArray(messages) ? messages : []).forEach((message, index) => {
            if (!message || typeof message !== 'object') return;
            if (!includeSystem && message.role === 'system') return;

            const nextMessage = toPlainContextMessage(message, index, trackSources);
            const previous = merged[merged.length - 1];
            if (previous
                && previous.role === nextMessage.role
                && mergeRoleSet.has(nextMessage.role)
                && previous._preventContextMerge !== true
                && nextMessage._preventContextMerge !== true) {
                previous.content = [previous.content, nextMessage.content].filter(Boolean).join('\n\n');
                if (!previous.name && nextMessage.name) previous.name = nextMessage.name;
                if (Number.isFinite(nextMessage._contextFloor)) {
                    previous._contextFloor = Number.isFinite(previous._contextFloor)
                        ? Math.min(previous._contextFloor, nextMessage._contextFloor)
                        : nextMessage._contextFloor;
                }
                if (trackSources || previous._sourceIndexes || nextMessage._sourceIndexes) {
                    previous._sourceIndexes = [
                        ...(previous._sourceIndexes || []),
                        ...(nextMessage._sourceIndexes || [])
                    ];
                }
                if (previous._worldInfoEntries || nextMessage._worldInfoEntries) {
                    previous._worldInfoEntries = [
                        ...(previous._worldInfoEntries || []),
                        ...(nextMessage._worldInfoEntries || [])
                    ];
                }
                return;
            }
            merged.push(nextMessage);
        });
        return merged;
    };

    const postprocessContextMessages = (messages) => mergeConsecutiveRoleMessages(messages, {
        mergeRoles: ['user', 'assistant'],
        includeSystem: true
    });

    const getPostprocessedChatMessages = (messages, options = {}) => {
        const { includeSystem = false } = options;
        return mergeConsecutiveRoleMessages(messages, {
            mergeRoles: ['user', 'assistant'],
            includeSystem,
            trackSources: true
        });
    };

    const buildConversationTurnSnapshot = (messages, options = {}) => {
        const { includeSystem = false, alreadyPostprocessed = false } = options;
        const processedMessages = alreadyPostprocessed
            ? (Array.isArray(messages) ? messages : [])
                .filter(message => message && typeof message === 'object' && (includeSystem || message.role !== 'system'))
                .map((message, index) => {
                    const nextMessage = toPlainContextMessage(message, index, false);
                    nextMessage._sourceIndexes = getMessageSourceIndexes(message, index, true);
                    return nextMessage;
                })
            : getPostprocessedChatMessages(messages, { includeSystem });

        const turns = [];
        let pendingUser = null;
        processedMessages.forEach((message, messageIndex) => {
            if (!message || message.role === 'system') return;
            const sourceIndexes = Array.isArray(message._sourceIndexes) ? message._sourceIndexes : [messageIndex];
            const sourceStartIndex = sourceIndexes.length ? Math.min(...sourceIndexes) : messageIndex;
            const sourceEndIndex = sourceIndexes.length ? Math.max(...sourceIndexes) : messageIndex;

            if (message.role === 'user') {
                pendingUser = { message, messageIndex, sourceIndexes, sourceStartIndex, sourceEndIndex };
                return;
            }
            if (message.role !== 'assistant' || !pendingUser) return;

            const turn = turns.length + 1;
            turns.push({
                turn,
                user: pendingUser.message,
                assistant: message,
                messages: [pendingUser.message, message],
                messageIndexes: [pendingUser.messageIndex, messageIndex],
                sourceIndexes: [...pendingUser.sourceIndexes, ...sourceIndexes],
                startIndex: pendingUser.sourceStartIndex,
                endIndex: sourceEndIndex
            });
            pendingUser = null;
        });
        return { messages: processedMessages, turns };
    };

    const getConversationTurnAtIndexFromSnapshot = (snapshot, index) => {
        if (!Number.isFinite(index) || index < 0) return null;
        const turns = Array.isArray(snapshot?.turns) ? snapshot.turns : [];
        const matchedTurn = turns.find(turn => (turn.sourceIndexes || []).includes(index));
        if (matchedTurn) return matchedTurn.turn;
        return turns.filter(turn => turn.endIndex < index).length + 1;
    };

    const toNonNegativeNumber = (value, fallback = 0) => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(0, number) : fallback;
    };

    const createWorldInfoRegex = (pattern) => {
        let source = String(pattern || '');
        let flags = 'i';
        if (source.startsWith('/') && source.lastIndexOf('/') > 0) {
            const lastSlash = source.lastIndexOf('/');
            const potentialFlags = source.slice(lastSlash + 1);
            if (/^[dgimsuvy]*$/.test(potentialFlags)) {
                source = source.slice(1, lastSlash);
                flags = potentialFlags;
            }
        }
        flags = flags.replace(/g/g, '');
        if (!flags.includes('i')) flags += 'i';
        if (/\\[pP]\{/.test(source) && !flags.includes('u')) flags += 'u';
        return new RegExp(source, flags);
    };

    const worldInfoKeyMatchesText = (entry, key, text) => {
        const rawKey = String(key || '').trim();
        const rawText = String(text || '');
        if (!rawKey || !rawText) return false;
        if (!entry?.useRegex) return rawText.toLowerCase().includes(rawKey.toLowerCase());
        try {
            return createWorldInfoRegex(rawKey).test(rawText);
        } catch (_) {
            console.warn(`Invalid world info regex: ${rawKey}`);
            return false;
        }
    };

    const resolveWorldInfoEntries = (entries, messages, settings = {}, options = {}) => {
        const activeEntries = (Array.isArray(entries) ? entries : []).filter(entry => entry?.enabled !== false);
        const chatMessages = Array.isArray(messages) ? messages : [];
        const random = typeof options.random === 'function' ? options.random : Math.random;
        const probabilityResults = new Map();
        const triggerMap = new Map();

        const passesProbability = (entry) => {
            const probability = Math.min(100, toNonNegativeNumber(entry?.probability, 100));
            if (entry?.useProbability === false || probability >= 100) return true;
            if (!probabilityResults.has(entry)) {
                probabilityResults.set(entry, probability > 0 && random() * 100 < probability);
            }
            return probabilityResults.get(entry) === true;
        };

        activeEntries.forEach(entry => {
            if (entry.constant) {
                triggerMap.set(entry, { score: Infinity, matchedKeys: ['常驻 (Constant)'] });
                return;
            }

            const rawScanDepth = toNonNegativeNumber(entry.scanDepth ?? settings.scanDepth, 0);
            const maxScanDepth = toNonNegativeNumber(settings.maxDepth, 0);
            const scanDepth = maxScanDepth > 0 ? Math.min(rawScanDepth, maxScanDepth) : rawScanDepth;
            const keys = Array.isArray(entry.keys) ? entry.keys : [];
            if (scanDepth === 0 || keys.length === 0 || !passesProbability(entry)) return;

            const scanText = chatMessages.slice(-scanDepth).map(message => message?.content || '').join('\n');
            const matchedKeys = keys
                .map(key => String(key || '').trim())
                .filter(key => key && worldInfoKeyMatchesText(entry, key, scanText));
            if (matchedKeys.length > 0) {
                triggerMap.set(entry, { score: matchedKeys.length, matchedKeys: [...new Set(matchedKeys)] });
            }
        });

        const resolvedEntries = [...triggerMap.keys()].sort((a, b) => {
            if (a.constant && !b.constant) return -1;
            if (!a.constant && b.constant) return 1;
            return (b.order || 0) - (a.order || 0);
        });
        const groups = {
            system_top: [],
            global_note: [],
            before_char: [],
            after_char: [],
            user_top: [],
            assistant_top: [],
            at_depth: []
        };
        resolvedEntries.forEach(entry => {
            const position = Object.prototype.hasOwnProperty.call(groups, entry.position) ? entry.position : 'at_depth';
            groups[position].push(entry);
        });
        Object.values(groups).forEach(group => group.sort((a, b) => (a.order || 0) - (b.order || 0)));

        return { entries: resolvedEntries, groups, triggerMap };
    };

    const buildContextViewerState = ({
        messages,
        budgetedEntries,
        triggeredEntries,
        postprocessedChatHistory,
        worldInfoSettings
    }) => {
        const escapeHtml = (value) => String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        const getDisplayName = (entry) => entry.comment || entry.name || '未命名条目';
        const floorInfo = new Map();
        const chatMessages = Array.isArray(postprocessedChatHistory) ? postprocessedChatHistory : [];
        const triggerMap = triggeredEntries instanceof Map ? triggeredEntries : new Map();
        const scanDepth = toNonNegativeNumber(worldInfoSettings?.scanDepth, 2);
        const maxScanDepth = toNonNegativeNumber(worldInfoSettings?.maxDepth, 0);

        triggerMap.forEach((data, entry) => {
            if (!data.matchedKeys) return;
            const rawEntryScanDepth = toNonNegativeNumber(entry.scanDepth ?? scanDepth, 0);
            const entryScanDepth = maxScanDepth > 0 ? Math.min(rawEntryScanDepth, maxScanDepth) : rawEntryScanDepth;
            const entryStart = Math.max(0, chatMessages.length - entryScanDepth);

            data.matchedKeys.forEach(key => {
                if (key === '常驻 (Constant)') return;
                for (let index = entryStart; index < chatMessages.length; index++) {
                    if (!worldInfoKeyMatchesText(entry, key, chatMessages[index].content)) continue;
                    if (!floorInfo.has(key)) floorInfo.set(key, new Set());
                    floorInfo.get(key).add(index + 1);
                }
            });
        });

        const getTriggerText = (entry) => {
            const entryData = triggerMap.get(entry);
            if (!entryData?.matchedKeys) return '关联触发';
            return entryData.matchedKeys.map(key => {
                if (key === '常驻 (Constant)') return '常驻';
                const floors = floorInfo.get(key);
                return floors?.size > 0
                    ? `${key} (${Array.from(floors).map(floor => `F${floor}`).join(', ')})`
                    : key;
            }).join(', ');
        };

        const worldInfoContents = (Array.isArray(budgetedEntries) ? budgetedEntries : [])
            .map(entry => String(entry.content || '').trim())
            .filter(Boolean);
        const triggeredWorldInfos = (Array.isArray(budgetedEntries) ? budgetedEntries : []).map(entry => ({
            name: getDisplayName(entry),
            triggers: getTriggerText(entry)
        }));
        const contextMessages = (Array.isArray(messages) ? messages : []).map(message => {
            const injectedWorldInfos = new Map();
            (Array.isArray(message._worldInfoEntries) ? message._worldInfoEntries : []).forEach(entry => {
                if (entry) injectedWorldInfos.set(getDisplayName(entry), getTriggerText(entry));
            });

            const recallCount = Number(message._enhancedMemoryRecallCount) || 0;
            const isMemory = recallCount > 0 || (message.role !== 'system' && isRoleMemoryContextContent(message.content));
            if (isMemory) {
                const memoryName = recallCount ? '增强记忆召回' : '角色记忆';
                const memoryTrigger = recallCount ? `已注入 ${recallCount} 条总结` : '已注入';
                injectedWorldInfos.set(memoryName, memoryTrigger);
                if (!triggeredWorldInfos.some(item => item.name === memoryName)) {
                    triggeredWorldInfos.push({ name: memoryName, triggers: memoryTrigger });
                }
            }

            const content = message.tool_calls
                ? JSON.stringify({ content: message.content, tool_calls: message.tool_calls }, null, 2)
                : String(message.content || '');
            let renderedContent = escapeHtml(content);
            Array.from(floorInfo.keys()).sort((a, b) => b.length - a.length).forEach(key => {
                if (!key) return;
                const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                renderedContent = renderedContent.replace(
                    new RegExp(`(${escapedKey})(?![^<]*>)`, 'gi'),
                    '<mark class="bg-yellow-200/80 text-yellow-900 border-b border-yellow-400 font-bold px-0.5 mx-px rounded shadow-sm">$1</mark>'
                );
            });
            // 总结记忆的编号标签和召回片段标签一样高亮，方便对照正文里的引用。
            renderedContent = renderedContent.replace(
                /\[M\d{1,6}\]/g,
                '<mark class="bg-primary-200/80 text-primary-900 border-b border-primary-400 font-bold px-1 rounded shadow-sm">$&</mark>'
            );
            if (isMemory) {
                renderedContent = renderedContent.replace(
                    /&lt;\/?(?:enhanced_memory_recall|memory_fragment)\b[\s\S]*?&gt;/g,
                    '<mark class="bg-primary-200/80 text-primary-900 border-b border-primary-400 font-bold px-1 rounded shadow-sm">$&</mark>'
                );
            }

            return {
                role: message.role,
                name: message.name,
                content,
                renderedContent,
                // 用对话里的真实楼层号：记忆压缩会把部分楼层并掉，按顺序重新编号就和简介对不上。
                floor: Number.isFinite(message._contextFloor) ? message._contextFloor : null,
                // 这条消息里世界书正文占的字数，查看器把它从所在消息里拆出来单独统计。
                worldInfoChars: worldInfoContents.reduce((total, text) => total + (content.includes(text) ? text.length : 0), 0),
                // 被记忆替换的楼层（总结和合并标记）也按记忆显示和统计，原文只算没被替换的部分。
                isMemory: isMemory || message._classicMemory === true,
                wiTriggers: Array.from(injectedWorldInfos.entries()).map(([name, triggers]) => ({ name, triggers }))
            };
        });

        return { contextMessages, triggeredWorldInfos };
    };

    const injectContextMessages = ({
        messages,
        worldInfoGroups,
        safeTargetLimit = 1
    }) => {
        const groups = worldInfoGroups || {};
        const finalMessages = [...(Array.isArray(messages) ? messages : [])];
        const joinEntries = (entries) => entries
            .map(entry => `[${entry.comment || 'Entry'}]\n${entry.content}`)
            .join('\n\n');
        const findDepthIndex = (depth) => {
            const reversedMessages = [...finalMessages].reverse();
            let countdown = depth;
            let targetIndex = -1;
            for (let index = 0; index < reversedMessages.length; index++) {
                if (reversedMessages[index].role === 'user' || reversedMessages[index].role === 'assistant') countdown--;
                if (countdown < 0) {
                    targetIndex = reversedMessages.length - 1 - index;
                    break;
                }
            }
            return Math.max(targetIndex, safeTargetLimit);
        };

        const depthEntries = Array.isArray(groups.at_depth) ? groups.at_depth : [];
        depthEntries.sort((a, b) => (a.order || 0) - (b.order || 0));
        depthEntries.forEach(entry => {
            finalMessages.splice(findDepthIndex(entry.depth !== undefined ? entry.depth : 4), 0, {
                role: 'user',
                content: `[${entry.comment || 'Entry'}]\n${entry.content}`,
                _worldInfoEntries: [entry]
            });
        });

        const userTopEntries = Array.isArray(groups.user_top) ? groups.user_top : [];
        if (userTopEntries.length > 0) {
            const lastUserMessage = finalMessages.slice().reverse().find(message => message.role === 'user');
            if (lastUserMessage) {
                lastUserMessage.content = `${joinEntries(userTopEntries)}\n\n${lastUserMessage.content}`;
                lastUserMessage._worldInfoEntries = [
                    ...(lastUserMessage._worldInfoEntries || []),
                    ...userTopEntries
                ];
            }
        }

        const assistantTopEntries = Array.isArray(groups.assistant_top) ? groups.assistant_top : [];
        if (assistantTopEntries.length > 0) {
            const lastAssistantMessage = finalMessages.slice().reverse().find(message => message?.role === 'assistant');
            if (lastAssistantMessage) {
                lastAssistantMessage.content = `${joinEntries(assistantTopEntries)}\n\n${lastAssistantMessage.content}`;
                lastAssistantMessage._worldInfoEntries = [
                    ...(lastAssistantMessage._worldInfoEntries || []),
                    ...assistantTopEntries
                ];
            }
        }
        return finalMessages;
    };

    window.RPHubContextUtils = {
        appendEnhancedMemoryRecall,
        buildContextViewerState,
        buildConversationTurnSnapshot,
        escapeXmlAttribute,
        escapeXmlText,
        getConversationTurnAtIndexFromSnapshot,
        getPostprocessedChatMessages,
        indentXmlText,
        injectContextMessages,
        isRoleMemoryContextContent,
        mergeConsecutiveRoleMessages,
        postprocessContextMessages,
        resolveWorldInfoEntries,
        toNonNegativeNumber,
        worldInfoKeyMatchesText
    };
})();

// --- Story branches ---
(function () {
    const STORY_BRANCH_MAIN_ID = 'main';
    const STORY_BRANCH_SCOPE_SEPARATOR = '__branch__';
    const STORY_BRANCH_CHAT_EXPORT_TYPE = 'rp-hub-branch-chat';
    const STORY_BRANCH_CHAT_EXPORT_VERSION = 1;

    const getStoryBranchScopeId = (characterId, branchId = STORY_BRANCH_MAIN_ID) => {
        if (!characterId || !branchId || branchId === STORY_BRANCH_MAIN_ID) return characterId || null;
        return `${characterId}${STORY_BRANCH_SCOPE_SEPARATOR}${branchId}`;
    };

    const getStoryBranchOwnerId = (scopeId) => String(scopeId || '').split(STORY_BRANCH_SCOPE_SEPARATOR)[0];

    const getConversationBodyLength = (history = []) => history.reduce((total, message) => {
        if (!['user', 'assistant'].includes(message?.role)) return total;
        return total + window.RPHubUtils.parseCot(message.content || '').main.length;
    }, 0);

    const formatStoryBranchWordCount = (count) => {
        const units = Math.max(0, Number(count) || 0) / 10000;
        const decimals = units < 1 ? 2 : units < 100 ? 1 : 0;
        const formatted = units.toFixed(decimals);
        return `${decimals > 0 ? formatted.replace(/\.?0+$/, '') : formatted}W`;
    };

    const createMainStoryBranch = (character) => ({
        id: STORY_BRANCH_MAIN_ID,
        name: '主线',
        parentId: null,
        createdAt: Number(character?.createdAt) || Date.now(),
        updatedAt: Date.now(),
        forkFloor: 0,
        floorCount: 0,
        messageCount: 0,
        wordCount: 0
    });

    const normalizeStoryBranches = (character, saved) => {
        const source = Array.isArray(saved?.branches) ? saved.branches : [];
        const seen = new Set();
        const branches = source.map((branch, index) => {
            const id = String(branch?.id || '').trim();
            if (!id || seen.has(id)) return null;
            seen.add(id);
            const fallbackName = id === STORY_BRANCH_MAIN_ID ? '主线' : `分支 ${index + 1}`;
            const name = id === STORY_BRANCH_MAIN_ID
                ? '主线'
                : String(branch?.name || fallbackName).trim().replace(/^路线(?=\s*\d+$)/, '分支');
            return {
                id,
                name: name.slice(0, 30),
                parentId: id === STORY_BRANCH_MAIN_ID ? null : String(branch?.parentId || STORY_BRANCH_MAIN_ID),
                createdAt: Number(branch?.createdAt) || Date.now(),
                updatedAt: Number(branch?.updatedAt) || Number(branch?.createdAt) || Date.now(),
                forkFloor: Math.max(0, Number(branch?.forkFloor) || 0),
                floorCount: Math.max(0, Number(branch?.floorCount) || 0),
                messageCount: Math.max(0, Number(branch?.messageCount) || 0),
                wordCount: Math.max(0, Number(branch?.wordCount) || 0)
            };
        }).filter(Boolean);

        if (!seen.has(STORY_BRANCH_MAIN_ID)) branches.unshift(createMainStoryBranch(character));
        const validIds = new Set(branches.map(branch => branch.id));
        branches.forEach(branch => {
            if (branch.id !== STORY_BRANCH_MAIN_ID && !validIds.has(branch.parentId)) {
                branch.parentId = STORY_BRANCH_MAIN_ID;
            }
        });
        return branches;
    };

    const createStoryRouteMap = ({ branches, activeBranchId, selectedBranchId, activeWordCount, activeFloorCount }) => {
        const NODE_WIDTH = 124;
        const NODE_HEIGHT = 64;
        const HORIZONTAL_GAP = 28;
        const LEVEL_GAP = 70;
        const PADDING_X = 28;
        const PADDING_Y = 30;
        const branchesById = new Map(branches.map(branch => [branch.id, branch]));
        const childrenByParent = new Map();
        branches.forEach(branch => {
            const parentId = branch.parentId || null;
            if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
            childrenByParent.get(parentId).push(branch);
        });
        childrenByParent.forEach(children => children.sort((a, b) => a.createdAt - b.createdAt));

        const positions = new Map();
        const visiting = new Set();
        let leafIndex = 0;
        let maxDepth = 0;
        const placeBranch = (branch, depth) => {
            if (positions.has(branch.id)) return positions.get(branch.id).centerX;
            if (visiting.has(branch.id)) return PADDING_X + NODE_WIDTH / 2;
            visiting.add(branch.id);
            maxDepth = Math.max(maxDepth, depth);
            const childCenters = (childrenByParent.get(branch.id) || [])
                .filter(child => child.id !== branch.id)
                .map(child => placeBranch(child, depth + 1));
            const centerX = childCenters.length
                ? childCenters.reduce((total, value) => total + value, 0) / childCenters.length
                : PADDING_X + NODE_WIDTH / 2 + leafIndex++ * (NODE_WIDTH + HORIZONTAL_GAP);
            const y = PADDING_Y + depth * (NODE_HEIGHT + LEVEL_GAP);
            positions.set(branch.id, { x: centerX - NODE_WIDTH / 2, y, centerX, centerY: y + NODE_HEIGHT / 2 });
            visiting.delete(branch.id);
            return centerX;
        };

        const roots = branches
            .filter(branch => !branch.parentId || !branchesById.has(branch.parentId))
            .sort((a, b) => (a.id === STORY_BRANCH_MAIN_ID ? -1 : b.id === STORY_BRANCH_MAIN_ID ? 1 : a.createdAt - b.createdAt));
        roots.forEach(branch => placeBranch(branch, 0));
        branches.forEach(branch => {
            if (!positions.has(branch.id)) placeBranch(branch, 0);
        });

        const collectRouteIds = (startId) => {
            const ids = new Set();
            let branch = branchesById.get(startId);
            while (branch && !ids.has(branch.id)) {
                ids.add(branch.id);
                branch = branchesById.get(branch.parentId);
            }
            return ids;
        };
        const activeRouteIds = collectRouteIds(activeBranchId);
        const selectedRouteIds = collectRouteIds(selectedBranchId);
        const routeColumns = Math.max(1, leafIndex);
        const naturalWidth = PADDING_X * 2 + routeColumns * NODE_WIDTH + (routeColumns - 1) * HORIZONTAL_GAP;
        const width = Math.max(360, naturalWidth);
        const horizontalOffset = (width - naturalWidth) / 2;
        const naturalHeight = PADDING_Y * 2 + (maxDepth + 1) * NODE_HEIGHT + maxDepth * LEVEL_GAP;
        const height = Math.max(170, naturalHeight);
        const verticalOffset = (height - naturalHeight) / 2;
        const nodes = branches.map(branch => {
            const position = positions.get(branch.id);
            const isActive = branch.id === activeBranchId;
            const wordCount = isActive ? activeWordCount : branch.wordCount;
            return {
                ...branch,
                ...position,
                x: position.x + horizontalOffset,
                y: position.y + verticalOffset,
                centerX: position.centerX + horizontalOffset,
                centerY: position.centerY + verticalOffset,
                isActive,
                isSelected: branch.id === selectedBranchId,
                isOnActiveRoute: activeRouteIds.has(branch.id),
                isOnSelectedRoute: selectedRouteIds.has(branch.id),
                floorCount: isActive ? activeFloorCount : branch.floorCount,
                wordCount,
                wordCountText: formatStoryBranchWordCount(wordCount)
            };
        });
        const links = nodes.filter(node => positions.has(node.parentId)).map(node => {
            const parent = positions.get(node.parentId);
            const startX = parent.centerX + horizontalOffset;
            const startY = parent.y + verticalOffset + NODE_HEIGHT;
            const endX = node.centerX;
            const endY = node.y;
            const middleY = (startY + endY) / 2;
            return {
                id: `${node.parentId}-${node.id}`,
                path: `M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY}`,
                isActive: activeRouteIds.has(node.id),
                isSelected: selectedRouteIds.has(node.id)
            };
        });
        return { nodes, links, width, height };
    };

    window.RPHubStoryBranches = {
        STORY_BRANCH_CHAT_EXPORT_TYPE,
        STORY_BRANCH_CHAT_EXPORT_VERSION,
        STORY_BRANCH_MAIN_ID,
        createStoryRouteMap,
        getConversationBodyLength,
        getStoryBranchOwnerId,
        getStoryBranchScopeId,
        normalizeStoryBranches
    };
})();

// --- UI-template utilities ---
(function () {
    const { generateUUID } = window.RPHubUtils;
    const DEFAULT_HTML = '';
    const DEFAULT_VARIABLES = {};

    const cloneUiObject = (value) => JSON.parse(JSON.stringify(value || {}));
    const cloneUiValue = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

    const stripUiTemplateCodeFence = (value) => {
        const text = String(value || '').trim();
        const fenced = text.match(/^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\s*```$/);
        return (fenced ? fenced[1] : text).trim();
    };

    const inferInitialUiTemplateState = (template = {}, variableState = null) => {
        if (template.initialVariableState && typeof template.initialVariableState === 'object') {
            return cloneUiObject(template.initialVariableState);
        }
        let baseState = cloneUiObject(variableState || template.variableState || template.variables || DEFAULT_VARIABLES);
        const logs = Array.isArray(template.changeLog) ? [...template.changeLog].sort((a, b) => (a.time || 0) - (b.time || 0)) : [];
        const initializedKeys = new Set();
        logs.forEach(log => {
            Object.entries(log.changes || {}).forEach(([key, change]) => {
                if (!initializedKeys.has(key) && change && Object.prototype.hasOwnProperty.call(change, 'from')) {
                    if (key === '$root') baseState = cloneUiValue(change.from) || {};
                    else baseState = setUiTemplateValue(baseState, key, change.from);
                    initializedKeys.add(key);
                }
            });
        });
        return baseState;
    };

    const normalizeUiTemplate = (template = {}) => {
        const variableState = (template.variableState && typeof template.variableState === 'object')
            ? cloneUiObject(template.variableState)
            : (template.variables && typeof template.variables === 'object'
                ? cloneUiObject(template.variables)
                : (template.initialVariableState && typeof template.initialVariableState === 'object'
                    ? cloneUiObject(template.initialVariableState)
                    : { ...DEFAULT_VARIABLES }));
        return {
            id: template.id || generateUUID(),
            name: template.name || 'UI模板',
            enabled: template.enabled !== false,
            scope: template.scope === 'global' ? 'global' : 'character',
            order: Number.isFinite(Number(template.order)) ? Number(template.order) : 100,
            placement: ['top', 'bottom'].includes(template.placement) ? template.placement : 'bottom',
            htmlTemplate: stripUiTemplateCodeFence(template.htmlTemplate || template.template || DEFAULT_HTML),
            initialVariableState: inferInitialUiTemplateState(template, variableState),
            variableState,
            variableSchema: (template.variableSchema && (typeof template.variableSchema === 'object' || typeof template.variableSchema === 'string')) ? template.variableSchema : '',
            changeLog: Array.isArray(template.changeLog) ? template.changeLog : [],
            runtimeByCharacter: (template.runtimeByCharacter && typeof template.runtimeByCharacter === 'object') ? cloneUiObject(template.runtimeByCharacter) : {},
            updateMode: template.updateMode || 'merge'
        };
    };

    const sanitizeUiTemplateImportEntry = (template = {}) => {
        const { changeLog, runtimeByCharacter, variableState, model, version, ...cleanTemplate } = template || {};
        if (!cleanTemplate.initialVariableState && !cleanTemplate.variables && variableState && typeof variableState === 'object') {
            cleanTemplate.initialVariableState = cloneUiObject(variableState);
        }
        return cleanTemplate;
    };

    const isUiTemplateObject = (value) => value !== null && typeof value === 'object';
    const splitUiTemplatePath = (path) => String(path || '')
        .trim()
        .replace(/\[(?:'([^']+)'|"([^"]+)"|([^\]]+))\]/g, (_, single, double, bare) => `.${single ?? double ?? String(bare || '').trim()}`)
        .split('.')
        .map(part => part.trim())
        .filter(Boolean);

    const readUiTemplatePath = (source, path) => {
        const normalizedPath = String(path || '').trim();
        if (!normalizedPath || normalizedPath === 'this' || normalizedPath === '.') return source;
        if (isUiTemplateObject(source) && Object.prototype.hasOwnProperty.call(source, normalizedPath)) {
            return source[normalizedPath];
        }
        return splitUiTemplatePath(normalizedPath).reduce((acc, key) => (
            acc !== undefined && acc !== null && acc[key] !== undefined ? acc[key] : undefined
        ), source);
    };

    const getUiTemplateValue = (source, path, context = null) => {
        const expression = String(path || '').trim();
        if (!expression) return undefined;
        if (context) {
            if (expression === 'this' || expression === '.') return context.current;
            if (expression === '@index') return context.index ?? 0;
            if (expression === '@number') return (context.index ?? 0) + 1;
            if (expression === '@first') return (context.index ?? 0) === 0;
            if (expression === '@last') return (context.index ?? 0) === (context.length ?? 0) - 1;
            if (expression === '@key') return context.key ?? context.index ?? '';
            if (expression.startsWith('root.')) return readUiTemplatePath(context.root, expression.slice(5));
            if (expression === 'root') return context.root;
            if (expression.startsWith('../')) {
                let parentContext = context.parentContext;
                let parentPath = expression;
                while (parentPath.startsWith('../')) {
                    parentPath = parentPath.slice(3);
                    if (parentPath.startsWith('../') && parentContext?.parentContext) {
                        parentContext = parentContext.parentContext;
                    }
                }
                const fallbackParent = { root: context.root, current: context.root, parentContext: null };
                return getUiTemplateValue(context.root, parentPath, parentContext || fallbackParent);
            }
            if (context.alias && (expression === context.alias || expression.startsWith(`${context.alias}.`))) {
                return expression === context.alias
                    ? context.current
                    : readUiTemplatePath(context.current, expression.slice(context.alias.length + 1));
            }
            const localValue = readUiTemplatePath(context.current, expression);
            if (localValue !== undefined) return localValue;
        }
        return readUiTemplatePath(source, expression);
    };

    const setUiTemplateValue = (source, path, value) => {
        const expression = String(path || '').trim();
        if (!expression) return source;
        if (expression === '$root' || expression === 'this' || expression === '.') return cloneUiValue(value);
        const root = isUiTemplateObject(source) ? source : {};
        if (Object.prototype.hasOwnProperty.call(root, expression) || !/[.[\]]/.test(expression)) {
            root[expression] = cloneUiValue(value);
            return root;
        }
        const parts = splitUiTemplatePath(expression);
        if (!parts.length) return root;
        let target = root;
        parts.forEach((part, index) => {
            if (index === parts.length - 1) {
                target[part] = cloneUiValue(value);
                return;
            }
            const nextPart = parts[index + 1];
            if (!isUiTemplateObject(target[part])) target[part] = /^\d+$/.test(nextPart) ? [] : {};
            target = target[part];
        });
        return root;
    };

    const stringifyUiTemplateValue = (value) => {
        if (value === undefined || value === null) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value, null, 2);
            } catch (error) {
                return String(value);
            }
        }
        return String(value);
    };

    const escapeUiValue = (value) => stringifyUiTemplateValue(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const createUiTemplateRenderContext = (variables, overrides = {}) => ({
        root: variables,
        current: variables,
        parentContext: null,
        index: 0,
        key: '',
        length: 1,
        alias: '',
        ...overrides
    });

    const renderUiTemplateString = (templateText, variables = {}, context = null) => {
        const activeContext = context || createUiTemplateRenderContext(variables);
        const withArrays = renderUiTemplateEachBlocks(String(templateText || ''), variables, activeContext);
        return withArrays.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, expression) => {
            const key = String(expression || '').trim();
            if (!key || key === 'else' || key.startsWith('#') || key.startsWith('/')) return match;
            return escapeUiValue(getUiTemplateValue(variables, key, activeContext));
        });
    };

    const renderUiTemplateEachBlocks = (templateText, variables = {}, context = null) => {
        let output = String(templateText || '');
        const eachBlockPattern = /\{\{\s*#each\s+([^\s}]+)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*\}\}((?:(?!\{\{\s*#each\b)[\s\S])*?)\{\{\s*\/each\s*\}\}/g;
        for (let pass = 0; pass < 50; pass++) {
            let replaced = false;
            output = output.replace(eachBlockPattern, (match, path, alias, body) => {
                replaced = true;
                const value = getUiTemplateValue(variables, path, context);
                const [itemTemplate, emptyTemplate = ''] = String(body || '').split(/\{\{\s*else\s*\}\}/i);
                const entries = Array.isArray(value)
                    ? value.map((item, index) => ({ item, key: index, index }))
                    : (isUiTemplateObject(value)
                        ? Object.entries(value).map(([key, item], index) => ({ item, key, index }))
                        : []);
                if (!entries.length) return renderUiTemplateString(emptyTemplate, variables, context);
                return entries.map(({ item, key, index }) => renderUiTemplateString(itemTemplate, variables, createUiTemplateRenderContext(variables, {
                    current: item,
                    parentContext: context,
                    index,
                    key,
                    length: entries.length,
                    alias: alias || ''
                }))).join('');
            });
            if (!replaced) break;
        }
        return output;
    };

    const htmlIframeSandbox = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-same-origin allow-downloads allow-pointer-lock allow-presentation allow-top-navigation-by-user-activation';

    const buildExecutableHtmlDocument = (rawHtml) => {
        const metaViewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">';
        const resetStyle = '<style>html,body{margin:0!important;padding:0!important;width:100%!important;height:auto!important;min-height:auto!important;word-wrap:break-word!important;box-sizing:border-box!important;overflow:hidden!important;}::-webkit-scrollbar{display:none;}*,*::before,*::after{box-sizing:inherit!important;}img,video,canvas,svg{max-width:100%!important;height:auto!important;}table{display:block!important;overflow-x:auto!important;max-width:100%!important;}pre{white-space:pre-wrap!important;word-wrap:break-word!important;max-width:100%!important;}.container,.reality-panel,.app-container{max-width:100%!important;width:100%!important;margin:0!important;border-radius:0!important;box-shadow:none!important;border:none!important;height:auto!important;min-height:0!important;}body>div:first-child{margin:0!important;max-width:100%!important;height:auto!important;min-height:0!important;}#app{height:auto!important;min-height:auto!important;}.bottom-safe{display:none!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;}</style>';
        const jqueryScript = '<script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js" defer><\/script>';
        const scriptShim = `
            <script>
                window.triggerSlash = function(text) {
                    if (window.parent && window.parent.triggerSlash) window.parent.triggerSlash(text);
                };

                let lastHeight = 0;
                let isUpdating = false;
                function updateHeight() {
                    if (!window.frameElement || isUpdating) return;
                    isUpdating = true;
                    requestAnimationFrame(function() {
                        var body = document.body;
                        var html = document.documentElement;
                        if (!body || !html) {
                            isUpdating = false;
                            return;
                        }
                        var maxBottom = 0;
                        for (var i = 0; i < body.children.length; i++) {
                            var child = body.children[i];
                            if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.tagName === 'LINK') continue;
                            var style = window.getComputedStyle(child);
                            if (style.position === 'fixed') continue;
                            var rect = child.getBoundingClientRect();
                            var itemMax = Math.max(rect.bottom, child.offsetTop + child.offsetHeight);
                            if (itemMax > maxBottom) maxBottom = itemMax;
                        }
                        var bodyStyle = window.getComputedStyle(body);
                        var marginBottom = parseFloat(bodyStyle.marginBottom) || 0;
                        var newHeight = Math.max(maxBottom + marginBottom, body.scrollHeight) + 4;
                        if (Math.abs(newHeight - lastHeight) > 0) {
                            lastHeight = newHeight;
                            window.frameElement.style.height = newHeight + 'px';
                        }
                        isUpdating = false;
                    });
                }

                window.addEventListener('load', function() {
                    updateHeight();
                    setTimeout(updateHeight, 200);
                    setTimeout(updateHeight, 1000);
                });
                window.addEventListener('resize', updateHeight);
                window.addEventListener('click', function(event) {
                    var slashTarget = event.target && event.target.closest && event.target.closest('[data-slash]');
                    if (slashTarget) {
                        event.preventDefault();
                        var command = slashTarget.getAttribute('data-slash');
                        if (command) window.triggerSlash(command);
                    }
                    var start = Date.now();
                    var tick = function() {
                        if (Date.now() - start >= 600) return;
                        updateHeight();
                        requestAnimationFrame(tick);
                    };
                    tick();
                });
                window.addEventListener('DOMContentLoaded', function() {
                    document.querySelectorAll('img').forEach(function(img) {
                        img.addEventListener('load', updateHeight);
                    });
                    // 卡片里的记忆引用 [M12]：借父页面同一套处理加角标，点击回到父页面打开判断依据。
                    var citations = window.parent && window.parent.RPHubMemoryCitations;
                    if (citations && citations.decorate(document)) {
                        var citationStyle = document.createElement('style');
                        citationStyle.textContent = citations.frameStyle();
                        document.head.appendChild(citationStyle);
                        document.addEventListener('click', function(event) {
                            var cite = event.target.closest && event.target.closest('.memory-cite, .memory-cite-text');
                            if (cite) citations.open(cite.getAttribute('data-memory-nos'));
                        });
                    }
                    updateHeight();
                });
                if (window.ResizeObserver) {
                    var ro = new ResizeObserver(updateHeight);
                    if (document.body) ro.observe(document.body);
                } else {
                    setInterval(updateHeight, 1000);
                }
                if (document.readyState === 'complete') updateHeight();
            <\/script>
        `;

        const content = rawHtml || '';
        const trimmed = content.trim();
        if (/^\s*(<!doctype|<html)/i.test(trimmed)) {
            const headRegex = /<head(\s[^>]*)?>/i;
            const htmlRegex = /<html(\s[^>]*)?>/i;
            if (headRegex.test(content)) {
                return content.replace(headRegex, match => match + metaViewport + resetStyle + jqueryScript + scriptShim);
            }
            if (htmlRegex.test(content)) {
                return content.replace(htmlRegex, match => match + '<head>' + metaViewport + resetStyle + jqueryScript + scriptShim + '</head>');
            }
            return metaViewport + resetStyle + jqueryScript + scriptShim + content;
        }

        return `<!DOCTYPE html>
<html>
<head>
${metaViewport}
${resetStyle}
${jqueryScript}
${scriptShim}
</head>
<body>
${content}
</body>
</html>`;
    };

    const createExecutableHtmlIframe = (rawHtml, extraClass = '') => {
        const iframe = document.createElement('iframe');
        iframe.className = `w-full bg-white block executable-html-frame ${extraClass}`.trim();
        iframe.style.height = 'auto';
        iframe.style.overflow = 'hidden';
        iframe.style.transition = 'height 0.2s ease-out';
        iframe.style.margin = '0';
        iframe.style.padding = '0';
        iframe.setAttribute('scrolling', 'no');
        iframe.setAttribute('sandbox', htmlIframeSandbox);
        iframe.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen; autoplay; encrypted-media; picture-in-picture');
        iframe.onload = function () {
            try {
                setTimeout(() => {
                    if (this.contentWindow && this.contentWindow.document) {
                        const doc = this.contentWindow.document;
                        this.style.height = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight) + 'px';
                    }
                }, 100);
            } catch (error) {
                console.warn('Failed to resize iframe:', error);
            }
        };
        iframe.srcdoc = buildExecutableHtmlDocument(rawHtml);
        return iframe;
    };

    const renderExecutableHtmlFrame = (rawHtml, extraClass = '') => {
        const container = document.createElement('div');
        container.className = 'html-card-container ui-template-frame-container';
        container.style.margin = '0';
        container.style.padding = '0';
        container.style.overflow = 'hidden';
        container.appendChild(createExecutableHtmlIframe(rawHtml, extraClass));
        return container.outerHTML;
    };

    const renderUiTemplateHtml = (template) => {
        if (!template || !template.htmlTemplate) return '';
        const variables = template.variableState || {};
        const html = renderUiTemplateString(stripUiTemplateCodeFence(template.htmlTemplate), variables);
        return renderExecutableHtmlFrame(html, 'ui-template-iframe');
    };

    const stringifyUiSchema = (schema) => {
        if (!schema) return '';
        return typeof schema === 'string' ? schema : JSON.stringify(schema, null, 2);
    };

    const findUiTemplateUpdateBlock = (text) => {
        const source = String(text || '');
        const taggedCandidate = window.RPHubCardUtils.findLastUnprotectedMatch(
            source, /<ui_template_updates\b[^>]*>/i, { includeUiTemplateUpdates: true }
        );
        const taggedTail = taggedCandidate ? source.slice(taggedCandidate.index).trimEnd() : '';
        const tagged = taggedTail.match(/^<ui_template_updates\b[^>]*>([\s\S]*?)(?:<\/ui_template_updates>)?$/i);
        if (tagged) {
            const result = [taggedTail, tagged[1]];
            result.index = taggedCandidate.index;
            return result;
        }
        return null;
    };

    const stripUiTemplateUpdateBlock = (text) => {
        const source = String(text || '');
        const match = findUiTemplateUpdateBlock(source);
        return match ? source.slice(0, match.index).trimEnd() : source;
    };

    const parseUiTemplateUpdates = (rawContent, expectedTemplates = []) => {
        const source = String(rawContent || '').trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
        if (!source) return { updates: [] };
        let parsed;
        try {
            parsed = JSON.parse(source);
        } catch (error) {
            const parseError = new SyntaxError(`JSON变量块格式错误：${error.message}`);
            parseError.jsonSource = source;
            throw parseError;
        }
        if (expectedTemplates.length > 1 && Array.isArray(parsed)
            && parsed.every(item => item && typeof item === 'object' && !Array.isArray(item)
                && typeof item.id === 'string' && Object.prototype.hasOwnProperty.call(item, 'variables'))) {
            return { updates: parsed.map(item => ({ id: item.id.trim(), variables: item.variables })) };
        }
        return { updates: [{ id: '', variables: parsed }] };
    };

    const normalizeUiTemplateUpdateList = (parsed, expectedTemplates = []) => {
        const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
        const isUnsafeKey = key => ['__proto__', 'prototype', 'constructor'].includes(String(key));
        const valueType = value => Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
        const issues = [];
        const updates = isRecord(parsed) && Array.isArray(parsed.updates) ? parsed.updates : [];
        if (!isRecord(parsed) || !Array.isArray(parsed.updates)) issues.push('变量块缺少有效的JSON更新内容');
        if (!issues.length && !updates.length) return updates;
        const templatesById = new Map(expectedTemplates.map(template => [String(template.id), template]));
        const receivedById = new Map();
        updates.forEach((update, index) => {
            const location = '第 ' + (index + 1) + ' 项';
            if (!isRecord(update)) { issues.push(location + '不是有效对象'); return; }
            if (!Object.prototype.hasOwnProperty.call(update, 'variables')) { issues.push(location + '缺少 variables 字段'); return; }
            if (update.variables === null || typeof update.variables !== 'object') { issues.push(location + '的 variables 必须是对象或数组'); return; }
            const unknownFields = Object.keys(update).filter(key => !['id', 'variables'].includes(key));
            if (unknownFields.length) issues.push(location + '包含未定义字段：' + unknownFields.join('、'));
            const explicitId = typeof update.id === 'string' ? update.id.trim() : '';
            const id = explicitId || (expectedTemplates.length === 1 ? String(expectedTemplates[0].id) : '');
            if (!id) { issues.push(expectedTemplates.length > 1 ? location + '缺少模板ID；多模板必须使用JSON数组成员的 id 字段' : location + '缺少有效模板ID'); return; }
            if (!templatesById.has(id)) { issues.push(location + '使用了未知模板ID“' + id + '”'); return; }
            if (!receivedById.has(id)) receivedById.set(id, []);
            receivedById.get(id).push({ variables: update.variables });
        });
        const dynamicSamplesFor = (expected, path, schemaText) => {
            if (!path) return undefined;
            const escaped = String(path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const hasIdMarker = String(schemaText || '').includes(path + '.{id}')
                || String(schemaText || '').includes(path + '{id}');
            const allowsNewKey = new RegExp('新增(?:键|\\s*id)[^\\n]*' + escaped, 'i').test(schemaText);
            if (!hasIdMarker && !allowsNewKey) return undefined;
            return expected.flatMap(Object.values);
        };
        const validateValue = (samples, actual, path, schemaText, unknownNames, invalidNames) => {
            const typedSamples = samples.filter(sample => sample !== null && sample !== undefined);
            if (actual === null && samples.includes(null)) return;
            if (typedSamples.length && !typedSamples.some(sample => valueType(sample) === valueType(actual))) {
                invalidNames.push(path || '$root');
                return;
            }
            if (Array.isArray(actual)) {
                // 所有原始成员共同定义合法字段；空数组不推断成员结构，但仍检查危险键。
                const items = typedSamples.filter(Array.isArray).flat();
                actual.forEach((item, index) => validateValue(items, item, (path || '$root') + '[' + index + ']', schemaText, unknownNames, invalidNames));
                return;
            }
            if (isRecord(actual)) {
                const objects = typedSamples.filter(isRecord);
                Object.entries(actual).forEach(([key, value]) => {
                    if (isUnsafeKey(key)) { unknownNames.push(path ? path + '.' + key : key); return; }
                    const childPath = path ? path + '.' + key : key;
                    let childSamples = objects.filter(object => Object.prototype.hasOwnProperty.call(object, key)).map(object => object[key]);
                    if (!childSamples.length && objects.length) {
                        childSamples = dynamicSamplesFor(objects, path, schemaText);
                        if (childSamples === undefined) { unknownNames.push(childPath); return; }
                    }
                    validateValue(childSamples, value, childPath, schemaText, unknownNames, invalidNames);
                });
            }
        };
        receivedById.forEach((received, id) => {
            const template = templatesById.get(id);
            const label = template.name || id;
            if (received.length > 1) issues.push('模板“' + label + '”重复输出了 ' + received.length + ' 次');
            const unknownNames = [];
            const invalidNames = [];
            // 字段定义不随运行状态缩减；旧模板沿用已有的初始状态推断。
            validateValue([inferInitialUiTemplateState(template)], received[0].variables, '', stringifyUiSchema(template.variableSchema), unknownNames, invalidNames);
            if (unknownNames.length) issues.push('模板“' + label + '”输出了未定义变量：' + unknownNames.join('、'));
            if (invalidNames.length) issues.push('模板“' + label + '”变量类型或结构错误：' + invalidNames.join('、'));
        });
        if (issues.length) throw new Error(issues.join('；'));
        return updates;
    };
    const applyUiTemplateUpdateListToTemplate = (template, updates, { model = '', turn = null, source = 'ai' } = {}) => {
        let fieldCount = 0;
        let changed = false;
        updates.forEach(update => {
            if (!template || !update || typeof update !== 'object') return;
            if (update.id && update.id !== template.id) return;
            if (update.variables === null || typeof update.variables !== 'object') return;
            const changes = {};
            const variableEntries = [];
            const collectEntries = (value, path = '') => {
                if (Array.isArray(value) || value === null || typeof value !== 'object') {
                    if (path) variableEntries.push([path, value]);
                    return;
                }
                const entries = Object.entries(value);
                if (!entries.length && path) variableEntries.push([path, value]);
                entries.forEach(([key, child]) => {
                    const childPath = path ? `${path}.${key}` : key;
                    const current = getUiTemplateValue(template.variableState || {}, childPath);
                    if (child && typeof child === 'object' && !Array.isArray(child)
                        && current && typeof current === 'object' && !Array.isArray(current)) collectEntries(child, childPath);
                    else variableEntries.push([childPath, child]);
                });
            };
            if (Array.isArray(update.variables)) variableEntries.push(['$root', update.variables]);
            else collectEntries(update.variables);
            variableEntries.forEach(([key, value]) => {
                const oldValue = key === '$root'
                    ? template.variableState
                    : getUiTemplateValue(template.variableState || {}, key);
                if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
                    template.variableState = setUiTemplateValue(template.variableState || {}, key, value);
                    changes[key] = { from: oldValue, to: value };
                }
            });
            if (Object.keys(changes).length > 0) {
                if (!Array.isArray(template.changeLog)) template.changeLog = [];
                template.changeLog.unshift({
                    id: generateUUID(),
                    time: Date.now(),
                    source,
                    model,
                    turn,
                    changes
                });
                template.changeLog = template.changeLog.slice(0, 50);
                fieldCount += Object.keys(changes).length;
                changed = true;
            }
        });
        return { changed, fieldCount };
    };

    window.RPHubUiTemplateUtils = {
        applyUiTemplateUpdateListToTemplate,
        buildExecutableHtmlDocument,
        cloneUiObject,
        cloneUiValue,
        createExecutableHtmlIframe,
        findUiTemplateUpdateBlock,
        getUiTemplateValue,
        inferInitialUiTemplateState,
        normalizeUiTemplate,
        normalizeUiTemplateUpdateList,
        parseUiTemplateUpdates,
        renderUiTemplateHtml,
        renderUiTemplateString,
        sanitizeUiTemplateImportEntry,
        setUiTemplateValue,
        stringifyUiSchema,
        stripUiTemplateCodeFence,
        stripUiTemplateUpdateBlock
    };
})();
