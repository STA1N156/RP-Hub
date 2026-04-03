const generateUUID = () => {
                    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    });
                };

const formatTimeAgo = (dateString) => {
                    if (!dateString) return '从未在线';
                    const date = new Date(dateString);
                    const now = new Date();
                    const seconds = Math.floor((now - date) / 1000);
                    
                    if (seconds < 60) return '刚刚';
                    const minutes = Math.floor(seconds / 60);
                    if (minutes < 60) return `${minutes}分钟前`;
                    const hours = Math.floor(minutes / 60);
                    if (hours < 24) return `${hours}小时前`;
                    const days = Math.floor(hours / 24);
                    if (days < 30) return `${days}天前`;
                    return date.toLocaleDateString();
                };

const parseCot = (text) => {
    if (!text) return { cot: '', main: '', sys: '', isFinished: false };
    // 匹配 <think> 或 <cot> 标签，支持未闭合的情况
    // 优化正则：允许闭合标签中存在空格，防止因闭合标签格式不规范（如 </think >）导致正文被吞
    // 同时支持闭合标签缺失斜杠的情况（如 <cot>...<cot>），这是某些模型常见的错误输出
    const cotPattern = /<(think|cot)>([\s\S]*?)(?:<\/\s*\1\s*>|<\s*\1\s*>|$)/gi;
    let cotContent = '';
    let mainContent = text;
    let isFinished = false;
    
    // 提取 CoT 内容并从正文中移除
    mainContent = mainContent.replace(cotPattern, (match, tag, content) => {
        // 对 CoT 的内容中的 < 符号进行转义，防止 DOMPurify 吞掉类似 <动作> 或 <thinking> 的标签
        // 通过跳过 ``` 和 ` 块，保证代码块的正常显示和复制功能
        const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/);
        let escapedContent = parts.map((part, i) => {
            if (i % 2 === 1) return part; // 保留代码块原样
            return part.replace(/</g, "&lt;"); // 仅转义左括号，不影响 Markdown 的 > 引用块语法
        }).join('');

        cotContent += escapedContent;
        // 如果匹配项包含闭合标签，则认为思维链已结束
        if (match.includes('</') || (match.match(new RegExp('<' + tag + '>', 'gi')) || []).length > 1) {
            isFinished = true;
        }
        return '';
    });

    let sys = '';
    const sysMatch = mainContent.match(/\n\n\[系统指令:\s*([\s\S]*?)\]\s*$/);
    if (sysMatch) {
        sys = sysMatch[1];
        mainContent = mainContent.slice(0, sysMatch.index).trim();
    }
    
    return { cot: cotContent.trim(), main: mainContent.trim(), sys: sys, isFinished };
};