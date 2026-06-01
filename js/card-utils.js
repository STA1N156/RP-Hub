(function () {
    const textDecoder = new TextDecoder('utf-8');
    const textEncoder = new TextEncoder();

    const toBytes = (value) => {
        if (value instanceof Uint8Array) return value;
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        if (ArrayBuffer.isView(value)) {
            return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        }
        throw new TypeError('Expected ArrayBuffer or Uint8Array');
    };

    const encodeBase64Utf8 = (value) => {
        const bytes = textEncoder.encode(String(value ?? ''));
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
            return textDecoder.decode(bytes);
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
                        const key = textDecoder.decode(data.slice(0, splitIndex));
                        chunks[key] = textDecoder.decode(data.slice(splitIndex + 1));
                    }
                } else if (type === 'iTXt') {
                    let cursor = 0;
                    while (cursor < data.length && data[cursor] !== 0) cursor += 1;
                    const key = textDecoder.decode(data.slice(0, cursor));
                    cursor += 1;

                    if (cursor + 2 <= data.length) {
                        const compressionFlag = data[cursor];
                        cursor += 2;
                        while (cursor < data.length && data[cursor] !== 0) cursor += 1;
                        cursor += 1;
                        while (cursor < data.length && data[cursor] !== 0) cursor += 1;
                        cursor += 1;

                        if (key && cursor < data.length && compressionFlag === 0) {
                            chunks[key] = textDecoder.decode(data.slice(cursor));
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

    const toNumber = (value, fallback) => {
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

    const toWorldInfoExportEntry = (entry = {}) => ({
        comment: entry.comment || entry.name || '',
        content: entry.content || '',
        enabled: toBoolean(entry.enabled, true),
        scope: entry.scope || 'character',
        keys: Array.isArray(entry.keys) ? entry.keys : [],
        useRegex: toBoolean(entry.useRegex, false),
        caseSensitive: toBoolean(entry.caseSensitive, false),
        matchWholeWords: toBoolean(entry.matchWholeWords, true),
        constant: toBoolean(entry.constant, false),
        position: entry.position || 'at_depth',
        order: toNumber(entry.order, 0),
        depth: toNumber(entry.depth, 4),
        scanDepth: toNumber(entry.scanDepth, null),
        probability: toNumber(entry.probability, 100),
        useProbability: toBoolean(entry.useProbability, true),
        excludeRecursion: toBoolean(entry.excludeRecursion, false),
        preventRecursion: toBoolean(entry.preventRecursion, false),
        delayUntilRecursion: toBoolean(entry.delayUntilRecursion, false)
    });

    const toRegexExportEntry = (script = {}) => {
        const exported = { ...script };
        if (!exported.name && exported.scriptName) exported.name = exported.scriptName;
        if (!exported.regex && exported.findRegex) exported.regex = exported.findRegex;
        if (!exported.replacement && exported.replaceString) exported.replacement = exported.replaceString;
        if (!exported.flags && exported.regexFlags) exported.flags = exported.regexFlags;
        if (!exported.flags) exported.flags = 'g';
        if (!Array.isArray(exported.placement)) exported.placement = [1, 2];
        if (exported.markdownOnly === undefined) exported.markdownOnly = false;
        if (exported.promptOnly === undefined) exported.promptOnly = false;
        if (exported.runOnEdit === undefined) exported.runOnEdit = false;
        if (exported.minDepth === undefined) exported.minDepth = null;
        if (exported.maxDepth === undefined) exported.maxDepth = null;
        if (!exported.scope) exported.scope = 'character';
        exported.disabled = exported.disabled !== undefined
            ? toBoolean(exported.disabled, false)
            : !toBoolean(exported.enabled, true);
        delete exported.enabled;
        return exported;
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
        const worldEntries = mapExportItems(
            character.worldInfo,
            worldInfoMapper
        );
        const regexScripts = mapExportItems(
            character.regexScripts,
            regexScriptMapper
        );
        const uiTemplates = mapExportItems(
            character.uiTemplates,
            uiTemplateMapper
        );

        const data = {
            name: character.name,
            description: character.description,
            personality: character.personality,
            scenario: character.scenario,
            first_mes: character.first_mes,
            creator_notes: character.creator_notes || 'Exported from RolePlay Hub',
            uiTemplates,
            extensions: {
                rp_hub_watermark: 'rp-hub',
                regex_scripts: regexScripts,
                rp_hub_ui_templates: uiTemplates
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
        const type = textEncoder.encode('tEXt');
        const keyData = textEncoder.encode(key);
        const valueData = textEncoder.encode(value);
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
        findPngCharacterPayload,
        imageUrlToPngBytes,
        injectPngTextChunk,
        parseCharacterPayload,
        parsePngCharacterData,
        readPngChunks,
        toRegexExportEntry,
        toUiTemplateExportEntry,
        toWorldInfoExportEntry
    };
})();
