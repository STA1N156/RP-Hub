// RP-Hub interface components: selectors, layout and reusable views.

// --- Custom select ---
(function () {
    const { ref, computed, nextTick, watch, onBeforeUnmount } = Vue;

    const toOption = (option, index) => {
        if (!option || typeof option !== 'object') {
            return {
                value: option,
                label: String(option ?? ''),
                description: '',
                disabled: false,
                group: '',
                key: `${index}:${String(option ?? '')}`
            };
        }

        const value = option.value;
        return {
            value,
            label: option.label ?? String(value ?? ''),
            description: option.description || '',
            disabled: !!option.disabled,
            group: option.group || '',
            key: option.key ?? `${index}:${String(value ?? '')}`
        };
    };

    window.RPHubCustomSelect = {
        name: 'CustomSelect',
        props: {
            modelValue: {
                type: [String, Number, Boolean],
                default: ''
            },
            options: {
                type: Array,
                default: () => []
            },
            placeholder: {
                type: String,
                default: '请选择'
            },
            disabled: {
                type: Boolean,
                default: false
            },
            buttonClass: {
                type: [String, Array, Object],
                default: ''
            },
            menuClass: {
                type: [String, Array, Object],
                default: ''
            },
            optionClass: {
                type: [String, Array, Object],
                default: ''
            }
        },
        emits: ['update:modelValue', 'change'],
        setup(props, { emit }) {
            const isOpen = ref(false);
            const triggerRef = ref(null);
            const menuRef = ref(null);
            const menuStyle = ref({});
            let listenersActive = false;

            const normalizedOptions = computed(() => props.options.map(toOption));
            const optionMatches = (left, right) => (
                Object.is(left, right)
                || (left !== undefined && right !== undefined && String(left) === String(right))
            );
            const selectedOption = computed(() => (
                normalizedOptions.value.find(option => optionMatches(option.value, props.modelValue))
            ));
            const selectedLabel = computed(() => selectedOption.value?.label || props.placeholder);

            const shouldShowGroup = (index) => {
                const option = normalizedOptions.value[index];
                if (!option?.group) return false;
                return index === 0 || normalizedOptions.value[index - 1]?.group !== option.group;
            };

            const updateMenuPosition = () => {
                const trigger = triggerRef.value;
                if (!trigger) return;

                const rect = trigger.getBoundingClientRect();
                const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.width;
                const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 600;
                const margin = 8;
                const gap = 6;
                const belowSpace = viewportHeight - rect.bottom - margin;
                const aboveSpace = rect.top - margin;
                const openAbove = belowSpace < 180 && aboveSpace > belowSpace;
                const width = Math.max(160, rect.width);
                const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - width - margin));
                const maxHeight = Math.max(120, Math.min(320, (openAbove ? aboveSpace : belowSpace) - gap));

                menuStyle.value = {
                    position: 'fixed',
                    left: `${left}px`,
                    width: `${width}px`,
                    maxHeight: `${maxHeight}px`,
                    zIndex: 10000,
                    ...(openAbove
                        ? { bottom: `${viewportHeight - rect.top + gap}px` }
                        : { top: `${rect.bottom + gap}px` })
                };
            };

            const closeMenu = () => {
                isOpen.value = false;
            };

            const openMenu = async () => {
                if (props.disabled) return;
                isOpen.value = true;
                await nextTick();
                updateMenuPosition();
            };

            const toggleMenu = () => {
                if (isOpen.value) {
                    closeMenu();
                    return;
                }
                openMenu();
            };

            const selectOption = (option) => {
                if (!option || option.disabled) return;
                emit('update:modelValue', option.value);
                emit('change', option.value);
                closeMenu();
            };

            const isSelected = (option) => optionMatches(option.value, props.modelValue);

            const onDocumentPointerDown = (event) => {
                const trigger = triggerRef.value;
                const menu = menuRef.value;
                const target = event.target;
                if (trigger?.contains(target) || menu?.contains(target)) return;
                closeMenu();
            };

            const onKeyDown = (event) => {
                if (event.key === 'Escape') closeMenu();
            };

            const addOpenListeners = () => {
                if (listenersActive) return;
                document.addEventListener('pointerdown', onDocumentPointerDown, true);
                document.addEventListener('keydown', onKeyDown);
                window.addEventListener('resize', updateMenuPosition);
                window.addEventListener('scroll', updateMenuPosition, true);
                listenersActive = true;
            };

            const removeOpenListeners = () => {
                if (!listenersActive) return;
                document.removeEventListener('pointerdown', onDocumentPointerDown, true);
                document.removeEventListener('keydown', onKeyDown);
                window.removeEventListener('resize', updateMenuPosition);
                window.removeEventListener('scroll', updateMenuPosition, true);
                listenersActive = false;
            };

            watch(isOpen, async (open) => {
                if (open) {
                    await nextTick();
                    updateMenuPosition();
                    addOpenListeners();
                } else {
                    removeOpenListeners();
                }
            });

            watch(() => props.options, () => {
                if (isOpen.value) nextTick(updateMenuPosition);
            }, { deep: true });

            onBeforeUnmount(removeOpenListeners);

            return {
                isOpen,
                triggerRef,
                menuRef,
                menuStyle,
                normalizedOptions,
                selectedLabel,
                shouldShowGroup,
                toggleMenu,
                selectOption,
                isSelected
            };
        },
        template: `
            <div class="relative w-full">
                <button
                    ref="triggerRef"
                    type="button"
                    :disabled="disabled"
                    :aria-expanded="isOpen ? 'true' : 'false'"
                    aria-haspopup="listbox"
                    :class="[
                        'relative flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-gray-800 shadow-sm transition-all hover:border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-60',
                        buttonClass
                    ]"
                    @click="toggleMenu"
                >
                    <span class="truncate">{{ selectedLabel }}</span>
                    <svg
                        :class="['h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200', isOpen ? 'rotate-180 text-gray-600' : '']"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </button>

                <teleport to="body">
                    <transition
                        enter-active-class="transition duration-150 ease-out"
                        enter-from-class="opacity-0 -translate-y-1 scale-[0.98]"
                        enter-to-class="opacity-100 translate-y-0 scale-100"
                        leave-active-class="transition duration-100 ease-in"
                        leave-from-class="opacity-100 translate-y-0 scale-100"
                        leave-to-class="opacity-0 -translate-y-1 scale-[0.98]"
                    >
                        <div
                            v-if="isOpen"
                            ref="menuRef"
                            :style="menuStyle"
                            :class="[
                                'overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl shadow-gray-900/15 backdrop-blur-xl custom-scrollbar',
                                menuClass
                            ]"
                            role="listbox"
                        >
                            <div v-if="normalizedOptions.length === 0" class="px-3 py-2 text-sm text-gray-400">
                                暂无选项
                            </div>
                            <template v-for="(option, index) in normalizedOptions" :key="option.key">
                                <div
                                    v-if="shouldShowGroup(index)"
                                    class="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 first:pt-1"
                                >
                                    {{ option.group }}
                                </div>
                                <button
                                    type="button"
                                    role="option"
                                    :aria-selected="isSelected(option) ? 'true' : 'false'"
                                    :disabled="option.disabled"
                                    :class="[
                                        'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                                        option.disabled ? 'cursor-not-allowed text-gray-300' : 'text-gray-700 hover:bg-primary-50 hover:text-primary-700',
                                        isSelected(option) && !option.disabled ? 'bg-primary-50 text-primary-700 font-bold' : '',
                                        optionClass
                                    ]"
                                    @click="selectOption(option)"
                                >
                                    <span class="min-w-0">
                                        <span class="block truncate">{{ option.label }}</span>
                                        <span v-if="option.description" class="mt-0.5 block truncate text-[11px] font-normal text-gray-400">
                                            {{ option.description }}
                                        </span>
                                    </span>
                                    <svg
                                        v-if="isSelected(option)"
                                        class="h-4 w-4 shrink-0 text-primary-600"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.6" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </button>
                            </template>
                        </div>
                    </transition>
                </teleport>
            </div>
        `
    };
})();

// --- Application layout ---
(function () {
    const primaryItems = Object.freeze([
        { view: 'chat', label: '聊天', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
        { view: 'characters', label: '角色卡管理', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
        { view: 'memory', label: '记忆系统', status: 'memory', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
        { view: 'uitemplates', label: 'UI模板', status: 'ui', icon: 'M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5' },
        { view: 'usage', label: '用量统计', icon: 'M4 19V9m5 10V5m5 14v-7m5 7V3M3 21h18' }
    ]);
    const onlineItems = Object.freeze([
        { view: 'generator', label: '角色卡生成', icon: 'M15 8a3 3 0 11-6 0 3 3 0 016 0zm-3 5c-4 0-7 2-7 5v1h8m5-6v6m-3-3h6' },
        { view: 'novel', label: '小说生成', icon: 'M20 19V16H7C5.34315 16 4 17.3431 4 19M8.8 22H16.8C17.9201 22 18.4802 22 18.908 21.782C19.2843 21.5903 19.5903 21.2843 19.782 20.908C20 20.4802 20 19.9201 20 18.8V5.2C20 4.07989 20 3.51984 19.782 3.09202C19.5903 2.71569 19.2843 2.40973 18.908 2.21799C18.4802 2 17.9201 2 16.8 2H8.8C7.11984 2 6.27976 2 5.63803 2.32698C5.07354 2.6146 4.6146 3.07354 4.32698 3.63803C4 4.27976 4 5.11984 4 6.8V17.2C4 18.8802 4 19.7202 4.32698 20.362C4.6146 20.9265 5.07354 21.3854 5.63803 21.673C6.27976 22 7.11984 22 8.8 22Z' },
        { view: 'square', label: '万相广场', square: true }
    ]);
    const advancedItems = Object.freeze([
        { view: 'presets', label: '预设', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4M6 18a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' },
        { view: 'worldinfo', label: '世界书', icon: 'M12 6.25v13m0-13C10.83 5.48 9.25 5 7.5 5S4.17 5.48 3 6.25v13C4.17 18.48 5.75 18 7.5 18s3.33.48 4.5 1.25m0-13C13.17 5.48 14.75 5 16.5 5S19.83 5.48 21 6.25v13C19.83 18.48 18.25 18 16.5 18s-3.33.48-4.5 1.25' },
        { view: 'regex', label: '正则', title: '正则脚本', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
        { view: 'tools', label: '工具', icon: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94L14.7 6.3z' }
    ]);

    const AppNavigation = {
        props: {
            currentView: { type: String, required: true },
            open: Boolean,
            memoryProcessing: Boolean,
            uiTemplateRunning: Boolean,
            user: { type: Object, required: true }
        },
        emits: ['update:current-view', 'close'],
        setup(props, { emit }) {
            const { ref, watch, nextTick, onMounted, onBeforeUnmount } = Vue;
            window.RPHubUpdateCheck.useUpdateCheck();
            const isDark = ref(window.RPHubTheme.current === 'dark');
            const syncTheme = event => { isDark.value = event.detail === 'dark'; };
            const toggleTheme = () => window.RPHubTheme.set(isDark.value ? 'light' : 'dark');
            onMounted(() => window.addEventListener('rphub-theme-change', syncTheme));
            onBeforeUnmount(() => window.removeEventListener('rphub-theme-change', syncTheme));
            const panel = ref(null);
            const position = ref({});
            const centered = ref(false);
            let returnFocus = null;
            const sections = [
                { label: '常用', items: [...primaryItems, { view: 'settings', label: '设置' }] },
                { label: '在线', items: onlineItems },
                { label: '高级', items: advancedItems }
            ];
            // Running index for the opening cascade (--i in CSS).
            let order = 0;
            sections.forEach(section => { section.offset = order; order += section.items.length + 1; });
            const footerOrder = order;
            const selectView = view => {
                emit('update:current-view', view);
                emit('close');
            };
            watch(() => props.open, async open => {
                if (!open) return;
                returnFocus = document.activeElement;
                centered.value = onlineItems.some(item => item.view === props.currentView);
                await nextTick();
                if (!props.open || !panel.value) return;
                const anchor = returnFocus?.getBoundingClientRect();
                position.value = centered.value ? {} : {
                    left: Math.max(12, Math.min(anchor?.left || 12, window.innerWidth - panel.value.offsetWidth - 12)) + 'px',
                    top: Math.max(12, Math.min((anchor?.bottom || 48) + 10, window.innerHeight - panel.value.offsetHeight - 12)) + 'px'
                };
                (panel.value.querySelector('[aria-current="page"]') || panel.value).focus({ preventScroll: true });
            });
            const restoreFocus = () => {
                if (props.open) return;
                const target = returnFocus?.isConnected && returnFocus.getClientRects().length
                    ? returnFocus
                    : [...document.querySelectorAll('.app-nav-trigger')].find(button => button.getClientRects().length);
                target?.focus({ preventScroll: true });
                returnFocus = null;
            };
            const trapFocus = event => {
                if (event.key !== 'Tab') return;
                const buttons = [...panel.value.querySelectorAll('button')];
                const first = buttons[0], last = buttons[buttons.length - 1];
                if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
                    event.preventDefault();
                    last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
            };
            return { panel, position, centered, sections, footerOrder, selectView, restoreFocus, trapFocus, isDark, toggleTheme };
        },
        template: `
            <transition name="app-navigation" :duration="{ enter: 560, leave: 250 }" @after-leave="restoreFocus">
                <div v-if="open" class="app-navigation-layer" @click.self="$emit('close')"
                    :class="{ 'app-navigation-layer--centered': centered }"
                    @keydown.esc.stop.prevent="$emit('close')" @keydown="trapFocus">
                    <section ref="panel" id="app-navigation-panel" class="app-navigation-panel"
                        :style="position" role="dialog" aria-modal="true" aria-label="应用导航" tabindex="-1">
                        <header class="app-navigation-header">
                            <div class="app-logo app-navigation-brand">
                                <span>RP <em>HUB</em></span>
                            </div>
                            <button type="button" class="app-navigation-close" @click="$emit('close')" aria-label="关闭导航">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                    <path d="m6 6 12 12M18 6 6 18" stroke-width="1.8" stroke-linecap="round"></path>
                                </svg>
                            </button>
                        </header>
                        <nav class="app-navigation-content custom-scrollbar" aria-label="页面">
                            <section v-for="section in sections" :key="section.label" class="app-navigation-section">
                                <h3 :style="{ '--i': section.offset }">{{ section.label }}</h3>
                                <div class="app-navigation-grid" :class="{ 'app-navigation-grid--online': section.label === '在线' }">
                                    <button v-for="(item, itemIndex) in section.items" :key="item.view" type="button"
                                        class="app-navigation-item" :class="{ 'is-current': item.view === currentView }"
                                        :style="{ '--i': section.offset + itemIndex + 1 }"
                                        :aria-current="item.view === currentView ? 'page' : null"
                                        @click="selectView(item.view)">
                                        <span class="app-navigation-icon">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                                <template v-if="item.square">
                                                    <rect x="3" y="3" width="7" height="7" rx="2" stroke-width="1.8"></rect>
                                                    <rect x="14" y="3" width="7" height="7" rx="2" stroke-width="1.8"></rect>
                                                    <rect x="3" y="14" width="7" height="7" rx="2" stroke-width="1.8"></rect>
                                                    <rect x="14" y="14" width="7" height="7" rx="2" stroke-width="1.8"></rect>
                                                </template>
                                                <path v-else-if="item.icon" :d="item.icon" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
                                                <use v-else href="#icon-settings"></use>
                                            </svg>
                                        </span>
                                        <span>{{ item.label }}</span>
                                        <i v-if="(item.status === 'memory' && memoryProcessing) || (item.status === 'ui' && uiTemplateRunning)"
                                            class="app-navigation-status" aria-label="处理中"></i>
                                    </button>
                                </div>
                            </section>
                        </nav>
                        <footer class="app-navigation-user" :style="{ '--i': footerOrder }">
                            <img v-if="user.avatar" :src="user.avatar" alt="">
                            <span v-else class="app-navigation-avatar">{{ (user.name || 'U').charAt(0).toUpperCase() }}</span>
                            <div><strong>{{ user.name }}</strong></div>
                            <button type="button" class="appearance-switch" role="switch" :aria-checked="isDark"
                                aria-label="夜间模式" :title="isDark ? '切换到日间模式' : '切换到夜间模式'" @click="toggleTheme">
                                <svg v-if="!isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                    <path d="M20.5 13.1A8.5 8.5 0 0110.9 3.5 8.5 8.5 0 1020.5 13.1Z" stroke-linecap="round" stroke-linejoin="round"></path>
                                </svg>
                                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                    <circle cx="12" cy="12" r="3.5"></circle>
                                    <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke-linecap="round"></path>
                                </svg>
                            </button>
                        </footer>
                    </section>
                </div>
            </transition>`
    };

    window.RPHubLayoutComponents = Object.freeze({ AppNavigation });
})();

// --- Reusable views and modals ---
(function () {
    const { onBeforeUnmount, ref, computed, watch, nextTick } = Vue;
    const CustomSelect = window.RPHubCustomSelect;

    const UiTemplatePending = {
        template: `
            <div class="ui-template-pending-card" role="status" aria-live="polite">
                <div class="ui-template-pending-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5">
                        </path>
                    </svg>
                    <span class="live-dots"><i></i><i></i><i></i></span>
                </div>
                <div class="ui-template-pending-content">
                    <div class="ui-template-pending-row">
                        <span class="ui-template-pending-title">分析中</span>
                    </div>
                </div>
            </div>`
    };

    const EmbeddedViewContent = {
        props: {
            src: String,
            loading: Boolean,
            loadingText: String
        },
        emits: ['load', 'menu'],
        template: `
            <button @click="$emit('menu')"
                class="app-nav-trigger app-nav-trigger--embedded" aria-label="打开导航" aria-haspopup="dialog" aria-controls="app-navigation-panel">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <use href="#icon-menu"></use>
                </svg>
            </button>
            <div class="flex-1 w-full relative bg-white h-full">
                <div v-if="loading" class="absolute inset-0 z-10 flex items-center justify-center bg-gray-50">
                    <div class="flex flex-col items-center">
                        <svg class="embedded-loading-spinner" viewBox="0 0 50 50" fill="none" aria-hidden="true">
                            <circle cx="25" cy="25" r="20" stroke-width="3"></circle>
                        </svg>
                        <div class="text-gray-500 font-medium">{{ loadingText }}</div>
                    </div>
                </div>
                <iframe :src="src" @load="$emit('load')" class="absolute inset-0 w-full h-full border-0"
                    allow="clipboard-write"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"></iframe>
            </div>`
    };

    const GenerationTimer = {
        props: {
            waitTime: Number,
            estimatedTime: Number,
            remoteEstimatedTime: Number,
            remote: Boolean
        },
        template: `
            <div class="typing-timer-badge flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full animate-fade-in mt-1 shadow-sm">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span class="whitespace-nowrap">
                    {{ waitTime }}s
                    <span v-if="estimatedTime || remoteEstimatedTime" class="text-gray-300 mx-0.5">/</span>
                    <span v-if="estimatedTime && !remote">{{ estimatedTime }}s</span>
                    <span v-else-if="remoteEstimatedTime">{{ remoteEstimatedTime }}s</span>
                </span>
            </div>`
    };

    const SettingsPageHeader = {
        props: { title: String },
        emits: ['menu'],
        template: `
            <div class="settings-page-header">
                <div class="management-page-heading">
                    <button @click="$emit('menu')" class="app-nav-trigger" aria-label="打开导航" aria-haspopup="dialog" aria-controls="app-navigation-panel">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor"><use href="#icon-menu"></use></svg>
                    </button>
                    <h2 class="text-xl md:text-2xl font-bold text-gray-800 flex items-center">
                        <slot name="icon"></slot>
                        {{ title }}
                        <slot name="title-extra"></slot>
                    </h2>
                </div>
                <div v-if="$slots.default" class="flex space-x-2 md:space-x-3">
                    <slot></slot>
                </div>
            </div>`
    };

    const SettingsHelp = {
        props: {
            topic: { type: String, required: true },
            openTopic: { type: String, default: '' },
            label: { type: String, required: true },
            triggerClass: { type: String, default: '' },
            popoverClass: { type: String, default: '' },
            iconClass: { type: String, default: 'h-3.5 w-3.5' }
        },
        emits: ['toggle'],
        template: `
            <button type="button" @click.stop="$emit('toggle', openTopic === topic ? '' : topic)"
                class="settings-help-trigger" :class="[triggerClass, { 'is-open': openTopic === topic }]"
                :aria-expanded="openTopic === topic" :aria-label="label">
                <svg :class="iconClass" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M9.1 9a3 3 0 115.8 1.1c-.6 1.1-1.9 1.3-2.5 2.2-.3.4-.4.8-.4 1.2M12 17h.01"></path>
                </svg>
            </button>
            <div v-if="openTopic === topic" class="settings-help-popover" :class="popoverClass">
                <span class="settings-help-popover-content"><slot></slot></span>
            </div>`
    };

    // Owns the open/close animation for every modal: the overlay fades, the panel rises.
    const ModalShell = {
        inheritAttrs: false,
        props: {
            show: Boolean,
            overlayClass: { type: [String, Array, Object], default: '' },
            panelClass: { type: [String, Array, Object], default: '' },
            closeOnBackdrop: Boolean
        },
        emits: ['close'],
        template: `
            <transition name="modal">
                <div v-if="show" :class="['app-modal-overlay fixed inset-0 flex items-center justify-center', overlayClass]"
                    @click.self="closeOnBackdrop && $emit('close')">
                    <div class="app-modal-panel" :class="panelClass"><slot></slot></div>
                </div>
            </transition>`
    };

    const ModalHeader = {
        emits: ['close'],
        template: `
            <div class="editor-modal-header">
                <slot></slot>
                <button @click="$emit('close')" class="modal-close-button">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>`
    };

    const UpdateNotificationModal = {
        props: {
            update: { type: Object, required: true },
            renderMarkdown: { type: Function, required: true }
        },
        setup(props, { expose }) {
            const show = ref(false);
            const countdown = ref(0);
            const scrolledToBottom = ref(false);
            const contentEl = ref(null);
            const remoteUpdateId = ref(null);
            const pendingRemoteUpdateId = ref(null);
            let countdownTimer = null;
            let countdownEndsAt = 0;
            let layoutTimer = null;

            const clearTimers = () => {
                clearInterval(countdownTimer);
                clearTimeout(layoutTimer);
                countdownTimer = null;
                layoutTimer = null;
            };
            const startCountdown = () => {
                clearInterval(countdownTimer);
                countdownEndsAt = Date.now() + 10_000;
                const updateCountdown = () => {
                    countdown.value = Math.max(0, Math.ceil((countdownEndsAt - Date.now()) / 1000));
                    if (countdown.value > 0) return;
                    clearInterval(countdownTimer);
                    countdownTimer = null;
                };
                updateCountdown();
                countdownTimer = setInterval(updateCountdown, 250);
            };
            const showRemoteUpdate = (versionId) => {
                clearTimers();
                remoteUpdateId.value = versionId;
                pendingRemoteUpdateId.value = null;
                countdown.value = 0;
                scrolledToBottom.value = true;
                show.value = true;
            };
            const handleRemoteUpdate = (event) => {
                const versionId = Number(event?.detail?.versionId);
                if (!Number.isInteger(versionId) || versionId < 10000 || versionId > 99999
                    || versionId <= Number(props.update.id)) return;
                if (remoteUpdateId.value !== null) {
                    remoteUpdateId.value = Math.max(remoteUpdateId.value, versionId);
                } else if (show.value) {
                    pendingRemoteUpdateId.value = Math.max(pendingRemoteUpdateId.value || 0, versionId);
                } else {
                    showRemoteUpdate(versionId);
                }
            };
            const check = () => {
                if (remoteUpdateId.value !== null || pendingRemoteUpdateId.value !== null) return;
                const lastId = Number.parseInt(localStorage.getItem('roleplay_hub_update_id'), 10);
                if (Number.isFinite(lastId) && lastId >= props.update.id) return;

                show.value = true;
                scrolledToBottom.value = false;
                startCountdown();
                layoutTimer = setTimeout(() => {
                    const element = contentEl.value;
                    if (element && element.scrollHeight <= element.clientHeight + 10) {
                        scrolledToBottom.value = true;
                    }
                }, 100);
            };
            const close = () => {
                if (countdown.value > 0) return;
                show.value = false;
                clearTimers();
                remoteUpdateId.value = null;
                localStorage.setItem('roleplay_hub_update_id', String(props.update.id));
                if (pendingRemoteUpdateId.value !== null) {
                    const versionId = pendingRemoteUpdateId.value;
                    layoutTimer = setTimeout(() => showRemoteUpdate(versionId), 150);
                }
            };
            const handleScroll = (event) => {
                const element = event.target;
                scrolledToBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 10;
            };

            window.addEventListener('rphub:update-available', handleRemoteUpdate);
            expose({ check });
            onBeforeUnmount(() => {
                clearTimers();
                window.removeEventListener('rphub:update-available', handleRemoteUpdate);
            });
            return { contentEl, countdown, handleScroll, close, remoteUpdateId, scrolledToBottom, show };
        },
        template: `
            <modal-shell :show="show" overlay-class="z-[80] p-4"
                panel-class="bg-white rounded-xl border border-gray-200 w-full max-w-lg flex flex-col shadow-2xl transform transition-all scale-100 overflow-hidden relative">
                    <div class="bg-gradient-to-r from-primary-50 to-white p-4 border-b border-gray-100">
                        <div class="flex items-center gap-3">
                            <h3 class="text-xl font-bold text-gray-900">{{ remoteUpdateId ? '发现新版本' : update.title }}</h3>
                            <span class="bg-primary-100 text-primary-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-primary-200 transform translate-y-0.5">New</span>
                        </div>
                    </div>
                    <div ref="contentEl" class="p-4 max-h-[75vh] overflow-y-auto custom-scrollbar update-content" @scroll="handleScroll">
                        <div v-if="remoteUpdateId" class="py-6 text-center">
                            <p class="text-lg font-bold text-gray-800">发现新版本，手动刷新页面后更新</p>
                        </div>
                        <div v-else class="prose prose-sm prose-gray max-w-none">
                            <div class="markdown-body" v-html="renderMarkdown(update.content, 'assistant', true)"></div>
                        </div>
                        <div class="mt-8 mb-2 flex justify-end">
                            <button @click="close" :disabled="!remoteUpdateId && countdown > 0"
                                :class="{ 'opacity-50 cursor-not-allowed': !remoteUpdateId && countdown > 0 }"
                                class="px-10 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg shadow-sm hover:shadow transition-all active:scale-95">
                                知道了 <span v-if="!remoteUpdateId && countdown > 0">({{ countdown }}s)</span>
                            </button>
                        </div>
                    </div>
                    <div v-show="!remoteUpdateId && !scrolledToBottom" class="absolute bottom-0 left-0 right-0 pt-12 pb-4 bg-gradient-to-t from-white via-white/80 to-transparent flex justify-center items-end pointer-events-none transition-opacity duration-300 rounded-b-xl">
                        <div class="text-xs text-blue-500 flex items-center gap-1 animate-bounce bg-white shadow-sm border border-blue-100 px-3 py-1.5 rounded-full">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
                            向下滑动查看完整内容
                        </div>
                    </div>
            </modal-shell>`
    };

    const MemoryBackfillModal = {
        props: {
            show: Boolean,
            progress: { type: Object, required: true }
        },
        emits: ['close', 'stop', 'retry'],
        setup(props, { emit }) {
            const dialog = ref(null);
            let previousFocus = null;
            watch(() => props.show, async show => {
                if (show) {
                    previousFocus = document.activeElement;
                    await nextTick();
                    dialog.value?.focus();
                } else if (previousFocus?.isConnected) previousFocus.focus();
            });
            const onKeydown = event => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    emit('close');
                } else if (event.key === 'Tab') {
                    const buttons = [...dialog.value.querySelectorAll('button:not(:disabled)')];
                    const first = buttons[0], last = buttons[buttons.length - 1];
                    if (event.shiftKey && (event.target === first || event.target === dialog.value)) {
                        event.preventDefault();
                        last?.focus();
                    } else if (!event.shiftKey && event.target === last) {
                        event.preventDefault();
                        first?.focus();
                    }
                }
            };
            const running = computed(() => props.progress.status === 'running');
            const formatDuration = milliseconds => {
                const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
                if (seconds < 60) return seconds + '秒';
                const minutes = Math.ceil(seconds / 60);
                return minutes < 60 ? minutes + '分钟' : Math.floor(minutes / 60) + '小时' + (minutes % 60 ? minutes % 60 + '分钟' : '');
            };
            const stageTiming = stage => {
                if (stage.current >= stage.total || !running.value || props.progress.phase !== stage.key) return '';
                if (!stage.current || !stage.elapsedMs) return '';
                const remaining = stage.elapsedMs / stage.current * (stage.total - stage.current);
                return '预计' + formatDuration(remaining);
            };
            const stages = computed(() => props.progress.stages.filter(stage => stage.total > 0));
            const statusLabel = computed(() => ({ running: '正在补录', done: '', stopped: '已停止', error: '未完成' }[props.progress.status] || ''));
            return { dialog, onKeydown, running, stages, statusLabel, stageTiming };
        },
        template: `
            <modal-shell :show="show" overlay-class="z-[80] p-2 md:p-3"
                panel-class="bg-white rounded-2xl border border-gray-200 w-full max-w-2xl flex flex-col shadow-2xl max-h-[94vh] overflow-hidden">
                <section ref="dialog" class="flex max-h-[94vh] flex-col outline-none" tabindex="-1"
                    role="dialog" aria-modal="true" aria-labelledby="memory-backfill-title" @keydown="onKeydown">
                    <modal-header @close="$emit('close')">
                        <div class="flex items-center gap-3">
                            <div class="p-2 bg-primary-50 text-primary-600 rounded-lg">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                                </svg>
                            </div>
                            <div>
                                <h3 id="memory-backfill-title" class="text-lg font-bold text-gray-800 leading-tight">补录记忆</h3>
                                <p v-if="statusLabel" class="text-xs text-gray-500" role="status" aria-live="polite">{{ statusLabel }}</p>
                            </div>
                        </div>
                    </modal-header>
                    <div class="flex-1 min-h-0 p-6 space-y-6 bg-gray-50/30 overflow-y-auto custom-scrollbar">
                        <p v-if="progress.message" class="break-words text-sm leading-relaxed"
                            :class="progress.status === 'error' ? 'text-red-600' : 'text-gray-500'" role="status">{{ progress.message }}</p>
                        <div v-if="stages.length" class="space-y-4">
                            <div v-for="stage in stages" :key="stage.key" class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                                <div class="mb-2 flex items-center justify-between gap-3 text-sm">
                                    <span class="font-medium text-gray-700">{{ stage.title }}</span>
                                    <span class="text-xs" :class="stage.current >= stage.total ? 'text-primary-600' : 'text-gray-400'">
                                        {{ stage.current >= stage.total ? '已完成' : running ? (stageTiming(stage) || '等待中') : '未完成' }}
                                    </span>
                                </div>
                                <div class="h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar"
                                    :aria-label="stage.title" :aria-valuenow="stage.current" aria-valuemin="0" :aria-valuemax="stage.total">
                                    <div class="h-full rounded-full bg-primary-600 transition-[width] duration-300 motion-reduce:transition-none"
                                        :style="{ width: Math.min(100, stage.current / stage.total * 100) + '%' }"></div>
                                </div>
                                <div class="mt-2 flex justify-between text-xs tabular-nums text-gray-500">
                                    <span>{{ stage.current.toLocaleString() }} / {{ stage.total.toLocaleString() }} {{ stage.unit }}</span>
                                    <span>{{ Math.floor(stage.current / stage.total * 100) }}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="p-4 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                        <button v-if="running" type="button" @click="$emit('stop')" class="modal-secondary-button">停止补录</button>
                        <button v-else-if="stages.length && progress.status !== 'done'" type="button" @click="$emit('retry')" class="modal-secondary-button">继续补录</button>
                        <button type="button" @click="$emit('close')" class="modal-primary-button">{{ running ? '后台继续' : '关闭' }}</button>
                    </div>
                </section>
            </modal-shell>`
    };

    const UserSetupModal = {
        props: {
            show: Boolean,
            name: { type: String, default: '' },
            description: { type: String, default: '' },
            person: { type: String, default: 'second' }
        },
        emits: ['update:name', 'update:description', 'update:person', 'save'],
        template: `
            <modal-shell :show="show" overlay-class="z-[70] p-4"
                panel-class="bg-white rounded-xl border border-gray-200 w-full max-w-md max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden shadow-2xl transform transition-all scale-100">
                    <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 custom-scrollbar">
                        <div class="flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 text-primary-600 mb-4 mx-auto">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                            </svg>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 mb-2 text-center">欢迎使用 RP Hub</h3>
                        <p class="text-sm text-gray-500 mb-6 text-center">为了获得更好的沉浸式体验，请先进行个性化设置。</p>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">您的称呼 <span class="text-red-500">*</span></label>
                                <input :value="name" @input="$emit('update:name', $event.target.value)" type="text"
                                    class="w-full bg-gray-50/60 border border-gray-300 rounded-lg px-4 py-2 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all"
                                    placeholder="角色对您的称呼">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">旁白叙事视角</label>
                                <div class="segmented-switch">
                                    <div class="segmented-switch__indicator" :class="{ 'is-right': person === 'third' }"></div>
                                    <button @click="$emit('update:person', 'second')" class="segmented-switch__option" :class="{ 'is-active': person === 'second' }">第二人称 (你)</button>
                                    <button @click="$emit('update:person', 'third')" class="segmented-switch__option" :class="{ 'is-active': person === 'third' }">第三人称 ({{ name || '您的称呼' }})</button>
                                </div>
                                <p class="mt-1.5 text-[11px] text-gray-400 px-1"></p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">详细设定 (可选)</label>
                                <textarea :value="description" @input="$emit('update:description', $event.target.value)" rows="6"
                                    class="w-full bg-gray-50/60 border border-gray-300 rounded-lg px-4 py-2 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all resize-y"
                                    placeholder="例如：您的外貌、性格、人设等..."></textarea>
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-50 px-4 py-3 sm:px-6 flex flex-row-reverse shrink-0 rounded-b-xl">
                        <button @click="$emit('save')" :disabled="!name || name === '请前往设置自定义你的名称'" type="button"
                            class="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">保存并开始</button>
                    </div>
            </modal-shell>`
    };

    const ModelSelectorModal = {
        props: {
            show: Boolean,
            target: { type: String, default: 'model' },
            searchQuery: { type: String, default: '' },
            activeTag: { type: String, default: 'all' },
            tags: { type: Array, default: () => [] },
            models: { type: Array, default: () => [] },
            currentModel: { type: String, default: '' },
            slotModels: { type: Array, default: () => [] }
        },
        emits: ['close', 'select', 'select-slots', 'update:search-query', 'update:active-tag'],
        data() {
            return {
                activeSlot: 0,
                draftSlotModels: ['', '', '']
            };
        },
        computed: {
            selectedModel() {
                return this.target === 'quickModels' ? this.draftSlotModels[this.activeSlot] : this.currentModel;
            }
        },
        watch: {
            show(visible) {
                if (visible && this.target === 'quickModels') {
                    this.activeSlot = 0;
                    this.draftSlotModels = [0, 1, 2].map(index => this.slotModels[index] || '');
                }
            }
        },
        methods: {
            selectionClass(active) {
                return active ? 'border-primary-400 bg-primary-50 text-primary-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50';
            },
            chooseModel(modelId) {
                if (this.target !== 'quickModels') {
                    this.$emit('select', modelId);
                    return;
                }
                this.draftSlotModels[this.activeSlot] = this.draftSlotModels[this.activeSlot] === modelId ? '' : modelId;
                this.$emit('select-slots', [...this.draftSlotModels]);
            }
        },
        template: `
            <modal-shell :show="show" overlay-class="z-50 p-3 sm:p-4"
                    panel-class="model-selector-panel bg-white rounded-2xl border border-gray-200 w-full max-w-3xl flex flex-col shadow-2xl overflow-hidden">
                    <section class="flex min-h-0 flex-1 flex-col" role="dialog" aria-modal="true" aria-labelledby="model-selector-title"
                        @keydown.esc.stop="$emit('close')">
                        <div class="model-selector-heading flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
                            <div class="flex min-w-0 items-center gap-3">
                                <div class="rounded-xl bg-primary-50 p-2 text-primary-600">
                                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 5h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2zM9 9h6v6H9z"></path>
                                    </svg>
                                </div>
                                <h3 id="model-selector-title" class="text-base font-bold text-gray-900 sm:text-lg">{{ target === 'quickModels' ? '聊天模型' : '选择模型' }}</h3>
                            </div>
                            <button type="button" @click="$emit('close')" aria-label="关闭模型选择" class="modal-close-button flex h-10 w-10 shrink-0 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div v-if="target === 'quickModels'" class="grid shrink-0 grid-cols-3 gap-2 px-4 pt-3 sm:px-5" role="group" aria-label="聊天模型槽位">
                            <button v-for="(_, index) in draftSlotModels" :key="index" type="button"
                                @click="activeSlot = index" :aria-pressed="activeSlot === index"
                                class="min-w-0 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
                                :class="selectionClass(activeSlot === index)">
                                <span class="mb-1 flex items-center justify-between text-xs font-semibold">槽位 {{ index + 1 }}<span v-if="activeSlot === index" class="h-1.5 w-1.5 rounded-full bg-primary-600" aria-hidden="true"></span></span>
                                <span class="block truncate text-[11px] font-mono" :title="draftSlotModels[index]">{{ draftSlotModels[index] || '未选择' }}</span>
                            </button>
                        </div>
                        <div class="flex shrink-0 flex-col gap-3 px-4 py-3 sm:px-5">
                            <div class="relative">
                                <svg class="pointer-events-none absolute left-3.5 top-3 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m21 21-5-5m2-6a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                </svg>
                                <input :value="searchQuery" @input="$emit('update:search-query', $event.target.value)" type="text" aria-label="搜索模型"
                                    autocomplete="off" spellcheck="false" :placeholder="target === 'memoryEmbeddingModel' ? '仅显示向量模型' : '搜索模型名称…'"
                                    :readonly="target === 'memoryEmbeddingModel'"
                                    :title="target === 'memoryEmbeddingModel' ? '仅显示 embedding 模型' : ''"
                                    class="h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-gray-50 py-2 pl-11 pr-11 text-base text-gray-800 placeholder-gray-400 transition-colors focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 sm:text-sm">
                                <button v-if="searchQuery && target !== 'memoryEmbeddingModel'" type="button" @click="$emit('update:search-query', '')"
                                    aria-label="清空搜索" class="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500">
                                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-width="2" d="m6 6 12 12M6 18 18 6"></path></svg>
                                </button>
                            </div>
                            <div class="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1" role="group" aria-label="模型分类">
                                <button v-for="tag in tags" :key="tag.name" type="button" @click="$emit('update:active-tag', tag.name)" :aria-pressed="activeTag === tag.name"
                                    class="flex h-7 shrink-0 items-center rounded-lg border px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
                                    :class="selectionClass(activeTag === tag.name)">
                                    <span>{{ tag.name === 'all' ? '全部' : (tag.name === 'other' ? '其他' : tag.name.toUpperCase()) }}</span>
                                    <span class="ml-1.5 text-[10px] tabular-nums">{{ tag.count }}</span>
                                </button>
                            </div>
                        </div>
                        <div class="model-selector-list min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-50/40 p-3 custom-scrollbar sm:p-4">
                            <div v-if="models.length === 0" class="flex min-h-full flex-col items-center justify-center gap-3 py-8 text-sm text-gray-500">
                                <svg class="h-9 w-9 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m21 21-5-5m2-6a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                </svg>
                                未找到可选模型
                            </div>
                            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="可选模型">
                                <button v-for="model in models" :key="model.id" type="button" @click="chooseModel(model.id)"
                                    :aria-label="model.id" :aria-pressed="selectedModel === model.id" :title="model.id"
                                    class="flex min-h-[56px] min-w-0 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2"
                                    :class="selectedModel === model.id ? 'border-primary-400 bg-primary-50 text-primary-800' : 'border-gray-200 bg-white text-gray-800 hover:border-primary-200 hover:bg-primary-50/40'">
                                    <span class="min-w-0 flex-1 text-sm font-semibold leading-5 [overflow-wrap:anywhere]">{{ model.id }}</span>
                                    <svg class="h-5 w-5 shrink-0 text-primary-600" :class="{ invisible: selectedModel !== model.id }"
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="m6 12 4 4 8-8"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </section>
            </modal-shell>`
    };

    const PaginationControls = {
        props: {
            current: { type: Number, required: true },
            total: { type: Number, required: true },
            label: { type: String, default: '分页' }
        },
        emits: ['change'],
        template: `
            <nav v-if="total > 1" class="flex items-center justify-center gap-2 pt-1" :aria-label="label">
                <button type="button" @click="$emit('change', current - 1)" :disabled="current === 1" class="pagination-button">
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                    </svg>
                    上一页
                </button>
                <span class="min-w-[58px] text-center text-xs font-mono text-gray-500">{{ current }} / {{ total }}</span>
                <button type="button" @click="$emit('change', current + 1)" :disabled="current === total" class="pagination-button">
                    下一页
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                </button>
            </nav>`
    };

    const AddCharacterModal = {
        props: { show: Boolean },
        emits: ['close', 'create', 'generate', 'import-character'],
        template: `
            <modal-shell :show="show" close-on-backdrop @close="$emit('close')"
                overlay-class="z-[60] p-4"
                panel-class="compact-modal-panel">
                    <div class="choice-modal">
                        <div class="choice-modal__head">
                            <h3>添加角色卡</h3>
                            <button type="button" @click="$emit('close')" class="modal-close-button" aria-label="关闭">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <p class="choice-modal__label">创建</p>
                        <div class="choice-modal__list">
                            <button type="button" @click="$emit('create')" class="choice-card">
                                <span class="choice-card__icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg></span>
                                <span class="choice-card__body"><span class="choice-card__title">新建角色卡</span><span class="choice-card__desc">从零开始创建一个角色卡</span></span>
                            </button>
                            <button type="button" @click="$emit('generate')" class="choice-card">
                                <span class="choice-card__icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 8a3 3 0 11-6 0 3 3 0 016 0zm-3 5c-4 0-7 2-7 5v1h8m5-6v6m-3-3h6"></path></svg></span>
                                <span class="choice-card__body"><span class="choice-card__title">生成角色卡</span><span class="choice-card__desc">使用 AI 一键生成角色卡</span></span>
                            </button>
                        </div>
                        <p class="choice-modal__label">导入</p>
                        <div class="choice-modal__list">
                            <label class="choice-card">
                                <span class="choice-card__icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg></span>
                                <span class="choice-card__body"><span class="choice-card__title">导入角色卡</span><span class="choice-card__desc">导入 .png 或 .json 文件</span></span>
                                <input type="file" accept=".png,.json" @change="$emit('import-character', $event)" class="hidden">
                            </label>
                            <label class="choice-card">
                                <span class="choice-card__icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg></span>
                                <span class="choice-card__body"><span class="choice-card__title">导入聊天记录</span><span class="choice-card__desc">支持全部分支与聊天数据</span></span>
                                <input type="file" accept=".jsonl" @change="$emit('import-character', $event)" class="hidden">
                            </label>
                        </div>
                    </div>
            </modal-shell>`
    };

    const AutoImageGenModal = {
        props: { show: Boolean },
        emits: ['decide'],
        template: `
            <modal-shell :show="show" overlay-class="z-[90] p-4"
                panel-class="bg-white rounded-2xl border border-gray-200 w-full max-w-md flex flex-col shadow-2xl transform transition-all scale-100 overflow-hidden">
                    <div class="bg-gradient-to-r from-primary-50 to-blue-50 p-6 border-b border-gray-100">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                </svg>
                            </div>
                            <h3 class="text-xl font-bold text-gray-900">自动生图</h3>
                        </div>
                    </div>
                    <div class="p-6 space-y-4">
                        <p class="text-gray-600 leading-relaxed text-center text-lg font-medium">是否为此角色卡开启 <span class="font-bold text-primary-600">自动生图</span> 功能？</p>
                        <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                            <div class="flex items-start mb-3">
                                <div class="flex-shrink-0">
                                    <svg class="h-5 w-5 text-yellow-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                                    </svg>
                                </div>
                                <h4 class="ml-2 text-sm font-bold text-yellow-800">注意事项</h4>
                            </div>
                            <ul class="list-disc list-outside ml-9 space-y-1.5 text-sm text-yellow-700">
                                <li>您可以在 “世界书 -> 自动生图” 手动管理此功能。</li>
                                <li>前往 “设置” 可以切换生图版本、风格与比例。</li>
                            </ul>
                        </div>
                    </div>
                    <div class="bg-gray-50 p-4 flex justify-end gap-3 rounded-b-2xl border-t border-gray-100">
                        <button @click="$emit('decide', false)" class="px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-xl border border-gray-200 transition-all active:scale-95">暂不开启</button>
                        <button @click="$emit('decide', true)" class="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95">立即开启</button>
                    </div>
            </modal-shell>`
    };

    const ActiveToolEditorModal = {
        props: {
            show: Boolean,
            tool: { type: Object, required: true },
            displayDescription: { type: String, default: '' },
            webTool: Boolean,
            minResultCount: { type: Number, required: true },
            maxResultCount: { type: Number, required: true }
        },
        emits: ['close', 'save', 'update:result-count', 'update:tavily-api-key'],
        template: `
            <modal-shell :show="show" overlay-class="z-50 p-4"
                panel-class="bg-white rounded-2xl border border-gray-200 w-full max-w-3xl flex flex-col shadow-2xl max-h-[90vh] overflow-hidden">
                    <modal-header @close="$emit('close')">
                        <div class="flex items-center gap-3">
                            <div class="p-2 bg-primary-50 text-primary-600 rounded-lg">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94L14.7 6.3z"></path></svg>
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-gray-800 leading-tight">编辑工具</h3>
                                <p class="text-xs text-gray-500">{{ tool.name || '未命名工具' }}</p>
                            </div>
                        </div>
                    </modal-header>
                    <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 bg-gray-50/30">
                        <div class="max-w-2xl mx-auto text-center">
                            <div class="w-14 h-14 mx-auto rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center shadow-sm border border-primary-100">
                                <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94L14.7 6.3z"></path></svg>
                            </div>
                            <h3 class="mt-4 text-xl md:text-2xl font-bold text-gray-900 leading-tight">{{ tool.name || '未命名工具' }}</h3>
                            <p class="mt-3 text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">{{ displayDescription }}</p>
                        </div>
                        <div v-if="tool.resultCount !== undefined" class="settings-field max-w-2xl mx-auto">
                            <div class="flex justify-between items-center mb-2">
                                <div class="text-sm font-semibold text-gray-700">返回条数</div>
                                <div class="text-xs font-mono font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 whitespace-nowrap">{{ tool.resultCount || 8 }} 条</div>
                            </div>
                            <input :value="tool.resultCount" @input="$emit('update:result-count', Number($event.target.value))" type="range"
                                :min="minResultCount" :max="maxResultCount" step="1"
                                class="compact-range w-full h-1.5 bg-primary-100 rounded-lg appearance-none cursor-pointer accent-primary-500">
                        </div>
                        <div v-if="webTool" class="max-w-2xl mx-auto">
                            <div class="mb-1.5 flex items-center justify-between gap-3">
                                <label for="tavily-api-key" class="text-xs font-bold text-gray-500 uppercase tracking-wide">Tavily API Key</label>
                                <a href="https://www.tavily.com/" target="_blank" rel="noopener noreferrer"
                                    class="text-primary-600 hover:text-primary-700 hover:underline cursor-pointer transition-colors text-xs normal-case font-medium shrink-0">获取密钥</a>
                            </div>
                            <input id="tavily-api-key" :value="tool.tavilyApiKey" @input="$emit('update:tavily-api-key', $event.target.value.trim())" type="password"
                                class="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 focus:outline-none transition-all" placeholder="tvly-...">
                        </div>
                    </div>
                    <div class="p-4 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                        <button @click="$emit('close')" class="modal-secondary-button">取消</button>
                        <button @click="$emit('save')" class="modal-primary-button">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                            保存工具
                        </button>
                    </div>
            </modal-shell>`
    };

    const MemoryCitationModal = {
        props: { items: { type: Array, default: () => [] } },
        emits: ['close'],
        template: `
            <modal-shell :show="items.length > 0" close-on-backdrop @close="$emit('close')"
                overlay-class="z-[70] p-4" panel-class="compact-modal-panel memory-cite-panel">
                    <div class="choice-modal">
                        <div class="choice-modal__head">
                            <div>
                                <h3>判断依据</h3>
                                <p>AI 写这句话时所参考的记忆</p>
                            </div>
                            <button type="button" @click="$emit('close')" class="modal-close-button" aria-label="关闭">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div class="memory-cite-list">
                            <article v-for="item in items" :key="item.no" class="memory-cite-card">
                                <header>
                                    <b>{{ item.turnLabel || '未知轮次' }}</b>
                                </header>
                                <p v-if="item.missing" class="is-missing">这条记忆已不存在，可能已被删除、清空或重新整理。</p>
                                <p v-else>{{ item.summary }}</p>
                            </article>
                        </div>
                    </div>
            </modal-shell>`
    };

    const PresetEditorModal = {
        components: { CustomSelect },
        props: {
            show: Boolean,
            preset: { type: Object, required: true },
            editing: Boolean,
            roleOptions: { type: Array, default: () => [] },
            roleLabel: { type: String, default: '' }
        },
        emits: ['close', 'save', 'update:name', 'update:role', 'update:content'],
        template: `
            <modal-shell :show="show" overlay-class="z-50 p-2 md:p-3"
                panel-class="bg-white rounded-2xl border border-gray-200 w-full max-w-2xl flex flex-col shadow-2xl max-h-[94vh] overflow-hidden">
                    <modal-header @close="$emit('close')">
                        <div class="flex items-center gap-3">
                            <div class="p-2 bg-primary-50 text-primary-600 rounded-lg">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-gray-800 leading-tight">{{ editing ? '编辑预设' : '新建预设' }}</h3>
                                <p class="text-xs text-gray-500">{{ roleLabel }}</p>
                            </div>
                        </div>
                    </modal-header>
                    <div class="flex-1 p-6 space-y-6 bg-gray-50/30 overflow-y-auto custom-scrollbar">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">预设名称</label>
                            <input :value="preset.name" @input="$emit('update:name', $event.target.value)" type="text"
                                class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm font-medium" placeholder="例如：沉浸式叙事">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">注入位置</label>
                            <custom-select :model-value="preset.role" @update:modelValue="$emit('update:role', $event)" :options="roleOptions" button-class="font-medium"></custom-select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex justify-between">
                                <span>{{ roleLabel }}内容</span>
                                <span class="text-[10px] font-normal normal-case bg-gray-100 px-1.5 rounded text-gray-500">{{ (preset.content || '').length }} 字符</span>
                            </label>
                            <textarea :value="preset.content" @input="$emit('update:content', $event.target.value)" rows="12"
                                class="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none text-sm shadow-inner leading-relaxed resize-y min-h-[200px]" placeholder="在此输入预设内容..."></textarea>
                        </div>
                    </div>
                    <div class="p-4 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                        <button @click="$emit('close')" class="modal-secondary-button">取消</button>
                        <button @click="$emit('save')" class="modal-primary-button">
                            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                            保存预设
                        </button>
                    </div>
            </modal-shell>`
    };

    const CharacterEditorModal = {
        props: {
            show: Boolean,
            character: { type: Object, required: true },
            editing: Boolean,
            tab: { type: String, default: 'basic' }
        },
        emits: ['close', 'save', 'avatar-upload', 'update:tab', 'update-field'],
        data: () => ({
            tabs: [
                { value: 'basic', label: '基础' },
                { value: 'description', label: '描述' },
                { value: 'personality', label: '人设' },
                { value: 'first_mes', label: '开场白' }
            ]
        }),
        methods: {
            updateField(field, value) {
                this.$emit('update-field', { field, value });
            }
        },
        template: `
            <modal-shell :show="show" overlay-class="z-50 p-0 md:p-4"
                panel-class="bg-white md:rounded-2xl border-0 md:border border-gray-200 w-full max-w-2xl h-full md:h-[750px] flex flex-col shadow-2xl overflow-hidden">
                    <div class="p-3 md:p-5 border-b border-gray-100 flex flex-col gap-4 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                        <div class="flex justify-between items-center">
                            <h3 class="text-lg md:text-xl font-bold text-gray-800 flex items-center">
                                <svg class="w-5 h-5 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                {{ editing ? '编辑角色' : '新建角色' }}
                            </h3>
                            <button @click="$emit('close')" class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 rounded-full transition-all">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div class="segmented-switch segmented-switch--compact segmented-switch--four w-full">
                            <div class="segmented-switch__indicator" :class="{
                                'is-position-2': tab === 'description',
                                'is-position-3': tab === 'personality',
                                'is-position-4': tab === 'first_mes'
                            }"></div>
                            <button v-for="item in tabs" :key="item.value" @click="$emit('update:tab', item.value)"
                                class="segmented-switch__option" :class="{ 'is-active': tab === item.value }">
                                <span>{{ item.label }}</span>
                            </button>
                        </div>
                    </div>

                    <div class="flex-1 overflow-y-auto p-3 md:p-8 custom-scrollbar flex flex-col bg-gray-50/30">
                        <div v-if="tab === 'basic'" class="animate-fade-in flex-1 flex flex-col gap-4 md:gap-6 items-center justify-center min-h-0">
                            <div class="flex flex-col items-center flex-shrink min-h-0">
                                <div class="w-auto h-[40vh] md:h-[45vh] aspect-[2/3] bg-gray-100 rounded-2xl border border-gray-200 overflow-hidden relative group shadow-xl ring-4 ring-white">
                                    <img :src="character.avatar" class="w-full h-full object-cover">
                                    <label class="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-[2px]">
                                        <svg class="w-8 h-8 text-white mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                        <span class="text-white font-bold text-sm">更换图片</span>
                                        <input type="file" accept="image/*" @change="$emit('avatar-upload', $event)" class="hidden">
                                    </label>
                                </div>
                            </div>
                            <div class="w-full max-w-md space-y-2 flex-shrink-0">
                                <div class="text-center">
                                    <label class="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">角色名称</label>
                                    <input :value="character.name" @input="updateField('name', $event.target.value)" type="text"
                                        class="w-full bg-gray-50/60 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none text-lg font-bold shadow-inner transition-all text-center" placeholder="输入角色名称...">
                                </div>
                            </div>
                        </div>

                        <div v-if="tab === 'description'" class="animate-fade-in h-full flex flex-col">
                            <div class="flex justify-between items-center mb-2"><label class="block text-sm font-bold text-gray-600">简短描述</label><span class="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{{ (character.description || '').length }} 字</span></div>
                            <textarea :value="character.description" @input="updateField('description', $event.target.value)"
                                class="w-full bg-gray-50/60 border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none flex-1 resize-none shadow-inner transition-all leading-relaxed" placeholder="对角色的简短介绍..."></textarea>
                        </div>
                        <div v-if="tab === 'personality'" class="animate-fade-in h-full flex flex-col">
                            <div class="flex justify-between items-center mb-2"><label class="block text-sm font-bold text-gray-600">具体人设</label><span class="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{{ (character.personality || '').length }} 字</span></div>
                            <textarea :value="character.personality" @input="updateField('personality', $event.target.value)"
                                class="w-full bg-gray-50/60 border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none flex-1 resize-none shadow-inner transition-all leading-relaxed" placeholder="详细的角色性格、外貌、喜好等设定..."></textarea>
                        </div>
                        <div v-if="tab === 'first_mes'" class="animate-fade-in h-full flex flex-col">
                            <div class="flex justify-between items-center mb-2"><label class="block text-sm font-bold text-gray-600">开场白</label><span class="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{{ (character.first_mes || '').length }} 字</span></div>
                            <textarea :value="character.first_mes" @input="updateField('first_mes', $event.target.value)"
                                class="w-full bg-gray-50/60 border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none flex-1 resize-none shadow-inner transition-all leading-relaxed" placeholder="角色在对话开始时说的第一句话..."></textarea>
                        </div>
                    </div>

                    <div class="p-3 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                        <button @click="$emit('close')" class="px-6 py-2.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-xl transition-all font-bold text-sm shadow-sm active:scale-95">取消</button>
                        <button @click="$emit('save')" class="px-8 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-all font-bold text-sm shadow-md hover:shadow-lg active:scale-95 flex items-center">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                            保存角色
                        </button>
                    </div>
            </modal-shell>`
    };

    const RegexEditorModal = {
        components: { CustomSelect },
        props: {
            show: Boolean,
            script: { type: Object, required: true },
            editing: Boolean,
            scopeOptions: { type: Array, default: () => [] }
        },
        emits: ['close', 'save', 'update-field'],
        methods: {
            updateField(field, value) {
                this.$emit('update-field', { field, value });
            },
            togglePlacement(value) {
                const placement = Array.isArray(this.script.placement) ? [...this.script.placement] : [];
                const index = placement.indexOf(value);
                if (index === -1) placement.push(value);
                else placement.splice(index, 1);
                this.updateField('placement', placement);
            },
            toggleMode(key, checked) {
                this.updateField(key, checked);
                if (checked) this.updateField(key === 'markdownOnly' ? 'promptOnly' : 'markdownOnly', false);
            },
            updateNumber(field, value) {
                this.updateField(field, value === '' ? '' : Number(value));
            }
        },
        template: `
            <modal-shell :show="show" overlay-class="z-50 p-2 md:p-3"
                panel-class="bg-white rounded-2xl border border-gray-200 w-full max-w-lg flex flex-col shadow-2xl max-h-[94vh] overflow-hidden">
                    <modal-header @close="$emit('close')">
                        <div class="flex items-center gap-3">
                            <div class="p-2 bg-primary-50 text-primary-600 rounded-lg">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-gray-800 leading-tight">{{ editing ? '编辑正则脚本' : '新建正则脚本' }}</h3>
                                <p class="text-xs text-gray-500">匹配与替换规则</p>
                            </div>
                        </div>
                    </modal-header>

                    <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 bg-gray-50/30">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">脚本名称</label>
                            <input :value="script.name" @input="updateField('name', $event.target.value)" type="text"
                                class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm" placeholder="例如：去除多余空行">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">作用范围</label>
                            <custom-select :model-value="script.scope" @update:modelValue="updateField('scope', $event)" :options="scopeOptions" button-class="bg-white"></custom-select>
                        </div>

                        <div class="grid grid-cols-4 gap-3">
                            <div class="col-span-3">
                                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">正则表达式</label>
                                <div class="relative">
                                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">/</span>
                                    <input :value="script.regex" @input="updateField('regex', $event.target.value)" type="text"
                                        class="w-full bg-white border border-gray-200 rounded-xl pl-6 pr-4 py-2.5 text-gray-800 font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm" placeholder="pattern">
                                    <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">/</span>
                                </div>
                            </div>
                            <div class="col-span-1">
                                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Flags</label>
                                <input :value="script.flags" @input="updateField('flags', $event.target.value)" type="text"
                                    class="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm text-center" placeholder="gim">
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">替换内容</label>
                            <textarea :value="script.replacement" @input="updateField('replacement', $event.target.value)" rows="9"
                                class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm resize-y min-h-[190px]" placeholder="支持 $1, $2 等捕获组引用"></textarea>
                        </div>

                        <details class="group border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                            <summary class="flex items-center justify-between p-4 cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors select-none">
                                <span class="text-sm font-bold text-gray-700 flex items-center">
                                    <svg class="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                                    高级选项 (生效位置、深度、模式)
                                </span>
                                <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </summary>
                            <div class="p-5 border-t border-gray-200 space-y-5 bg-gray-50/30">
                                <div>
                                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">生效位置</label>
                                    <div class="grid grid-cols-2 gap-3">
                                        <label v-for="(label, val) in {1: '用户消息', 2: 'AI消息'}" :key="val"
                                            class="message-placement" :class="{ 'is-selected': script.placement && script.placement.includes(Number(val)) }">
                                            <input type="checkbox" :checked="script.placement && script.placement.includes(Number(val))" @change="togglePlacement(Number(val))" class="sr-only">
                                            <div class="message-placement-check">
                                                <svg v-if="script.placement && script.placement.includes(Number(val))" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M5 13l4 4L19 7"></path></svg>
                                            </div>
                                            <span class="text-xs font-bold">{{ label }}</span>
                                        </label>
                                    </div>
                                </div>

                                <div class="grid grid-cols-2 gap-3">
                                    <label v-for="(label, key) in {markdownOnly: '仅用户可见', promptOnly: '仅AI可见'}" :key="key"
                                        class="message-placement" :class="{ 'is-selected': script[key] }">
                                        <input type="checkbox" :checked="script[key]" @change="toggleMode(key, $event.target.checked)" class="sr-only">
                                        <div class="message-placement-check">
                                            <svg v-if="script[key]" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M5 13l4 4L19 7"></path></svg>
                                        </div>
                                        <span class="text-xs font-bold">{{ label }}</span>
                                    </label>
                                </div>

                                <div class="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200/50">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">最小深度</label>
                                        <input type="number" :value="script.minDepth" @input="updateNumber('minDepth', $event.target.value)"
                                            class="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 focus:outline-none transition-all shadow-sm" placeholder="无限制">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">最大深度</label>
                                        <input type="number" :value="script.maxDepth" @input="updateNumber('maxDepth', $event.target.value)"
                                            class="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 focus:outline-none transition-all shadow-sm" placeholder="无限制">
                                    </div>
                                </div>
                            </div>
                        </details>
                    </div>

                    <div class="p-4 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                        <button @click="$emit('close')" class="modal-secondary-button">取消</button>
                        <button @click="$emit('save')" class="modal-primary-button">
                            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                            保存脚本
                        </button>
                    </div>
            </modal-shell>`
    };

    const UiTemplateEditorModal = {
        components: { CustomSelect },
        props: {
            show: Boolean,
            templateData: { type: Object, required: true },
            editing: Boolean,
            tab: { type: String, default: 'edit' },
            previewHtml: { type: String, default: '' },
            scopeOptions: { type: Array, default: () => [] },
            placementOptions: { type: Array, default: () => [] }
        },
        emits: ['close', 'save', 'update:tab', 'update-field'],
        methods: {
            updateField(field, value) {
                this.$emit('update-field', { field, value });
            },
            updateNumber(field, value) {
                this.updateField(field, value === '' ? '' : Number(value));
            },
            formatLogMeta(log) {
                const time = Number(log?.time) ? new Date(log.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
                return [log?.turn ? `第 ${log.turn} 轮` : '', time].filter(Boolean).join(' · ');
            },
            formatChangeValue(value) {
                if (value === undefined || value === null || value === '') return '空';
                if (typeof value !== 'object') return String(value);
                try {
                    return JSON.stringify(value, null, 2);
                } catch (error) {
                    return String(value);
                }
            },
            checkProtocol() {
                const utils = window.RPHubUiTemplateUtils;
                if (!utils?.normalizeUiTemplateUpdateList) {
                    this.protocolCheck = { ok: false, message: '模板校验器尚未加载' };
                    return;
                }
                let variableState;
                try {
                    variableState = JSON.parse(this.templateData.variableStateText || '{}');
                    if (variableState === null || typeof variableState !== 'object') throw new Error('变量状态必须是 JSON 对象或数组');
                } catch (error) {
                    this.protocolCheck = { ok: false, message: error.message || '变量 JSON 格式错误' };
                    return;
                }
                let variableSchema = this.templateData.variableSchemaText || '';
                if (variableSchema.trim()) {
                    try { variableSchema = JSON.parse(variableSchema); } catch (error) { /* 变量说明允许使用普通文字 */ }
                }
                try {
                    const template = {
                        id: this.templateData.id || '__preview__',
                        name: this.templateData.name || '当前模板',
                        variableState,
                        variableSchema
                    };
                    utils.normalizeUiTemplateUpdateList({ updates: [{ id: template.id, variables: variableState }] }, [template]);
                } catch (error) {
                    this.protocolCheck = { ok: false, message: error.message || '变量结构检查失败' };
                    return;
                }
                if (!String(this.templateData.htmlTemplate || '').trim()) {
                    this.protocolCheck = { ok: false, message: 'HTML 模板为空' };
                    return;
                }
                this.protocolCheck = { ok: true, message: '模板协议检查通过' };
            }
        },
        data() {
            return {
                protocolCheck: null,
                protocolCheckTimer: null,
                codeTab: 'html',
                codeTabs: Object.freeze([
                    { value: 'html', label: 'HTML' },
                    { value: 'state', label: '变量 JSON' },
                    { value: 'schema', label: '变量说明' }
                ])
            };
        },
        computed: {
            protocolCheckInput() {
                return this.show && this.tab === 'edit'
                    ? [this.templateData.htmlTemplate, this.templateData.variableStateText, this.templateData.variableSchemaText]
                    : null;
            }
        },
        watch: {
            protocolCheckInput: {
                immediate: true,
                handler(input) {
                    clearTimeout(this.protocolCheckTimer);
                    this.protocolCheckTimer = null;
                    this.protocolCheck = null;
                    if (input) this.protocolCheckTimer = setTimeout(() => {
                        this.protocolCheckTimer = null;
                        this.checkProtocol();
                    }, 500);
                }
            }
        },
        beforeUnmount() {
            clearTimeout(this.protocolCheckTimer);
        },
        template: `
            <modal-shell :show="show" overlay-class="z-50 p-2 md:p-3"
                panel-class="bg-white rounded-2xl border border-gray-200 w-full max-w-6xl flex flex-col shadow-2xl max-h-[94vh] overflow-hidden">
                    <modal-header @close="$emit('close')">
                        <div class="flex items-center gap-3">
                            <div class="p-2 bg-primary-50 text-primary-600 rounded-lg">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5"></path></svg>
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-gray-800 leading-tight">{{ editing ? '编辑UI模板' : '新建UI模板' }}</h3>
                                <p class="text-xs text-gray-500">HTML状态栏 + 变量JSON</p>
                            </div>
                        </div>
                    </modal-header>

                    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-5">
                        <div class="segmented-switch segmented-switch--slim">
                            <div class="segmented-switch__indicator" :class="{ 'is-right': tab !== 'history' }"></div>
                            <button @click="$emit('update:tab', 'history')" class="segmented-switch__option" :class="{ 'is-active': tab === 'history' }"><span>变更记录</span></button>
                            <button @click="$emit('update:tab', 'edit')" class="segmented-switch__option" :class="{ 'is-active': tab === 'edit' }"><span>编辑内容</span></button>
                        </div>

                        <template v-if="tab === 'history'">
                            <div v-if="!(templateData.changeLog || []).length" class="empty-state">
                                <svg fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M12 8v4l2.5 1.5M3.05 11a9 9 0 1 1 .5 4M3 4v5h5"></path>
                                </svg>
                                <p>暂无变更记录</p>
                                <small>变量分析更新这个模板后，最近一次的变化会显示在这里</small>
                            </div>
                            <section v-for="log in (templateData.changeLog || []).slice(0, 1)" :key="log.id" class="ui-template-history">
                                <header class="ui-template-history__meta">
                                    <span>最近一次变更</span>
                                    <span>{{ formatLogMeta(log) }}</span>
                                </header>
                                <div v-for="(change, key) in (log.changes || {})" :key="key" class="ui-template-history__row">
                                    <code class="ui-template-history__key">{{ key }}</code>
                                    <div class="ui-template-history__values">
                                        <del>{{ formatChangeValue(change && change.from) }}</del>
                                        <svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-label="变为"><path d="M5 12h14m-6-6 6 6-6 6"></path></svg>
                                        <ins>{{ formatChangeValue(change && change.to) }}</ins>
                                    </div>
                                </div>
                            </section>
                        </template>

                        <div v-else class="space-y-5">
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">模板名称</label>
                                    <input :value="templateData.name" @input="updateField('name', $event.target.value)" type="text"
                                        class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm" placeholder="例如：角色状态栏">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">作用范围</label>
                                    <custom-select :model-value="templateData.scope" @update:modelValue="updateField('scope', $event)" :options="scopeOptions"></custom-select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">插入位置</label>
                                    <custom-select :model-value="templateData.placement" @update:modelValue="updateField('placement', $event)" :options="placementOptions"></custom-select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">排序</label>
                                    <input :value="templateData.order" @input="updateNumber('order', $event.target.value)" type="number"
                                        class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm" placeholder="100">
                                </div>
                            </div>

                            <!-- Code on the left, a live stage on the right (stacked on phones) -->
                            <div class="ui-template-workspace">
                                <section class="min-w-0">
                                    <div class="segmented-switch segmented-switch--compact segmented-switch--three">
                                        <div class="segmented-switch__indicator" :class="{ 'is-position-2': codeTab === 'state', 'is-position-3': codeTab === 'schema' }"></div>
                                        <button v-for="option in codeTabs" :key="option.value" type="button" @click="codeTab = option.value"
                                            class="segmented-switch__option" :class="{ 'is-active': codeTab === option.value }">{{ option.label }}</button>
                                    </div>
                                    <textarea v-show="codeTab === 'html'" :value="templateData.htmlTemplate" @input="updateField('htmlTemplate', $event.target.value)"
                                        class="ui-template-code" spellcheck="false" aria-label="HTML模板" placeholder="<section>...</section>"></textarea>
                                    <textarea v-show="codeTab === 'state'" :value="templateData.variableStateText" @input="updateField('variableStateText', $event.target.value)"
                                        class="ui-template-code" spellcheck="false" aria-label="变量JSON" placeholder='{"status":"平稳","equipment":[{"slot":"武器","name":"短剑","durability":80}]}'></textarea>
                                    <textarea v-show="codeTab === 'schema'" :value="templateData.variableSchemaText" @input="updateField('variableSchemaText', $event.target.value)"
                                        class="ui-template-code ui-template-code--prose" aria-label="变量说明" placeholder="给 AI 参考，可选。例如：status 表示角色当前身体和情绪状态；location 表示当前场景地点；relationship 表示双方关系变化。"></textarea>
                                </section>
                                <section class="ui-template-stage-wrap">
                                    <div class="ui-template-stage-label">预览<span>使用初始变量</span></div>
                                    <div class="ui-template-stage"><div class="ui-template-preview" v-html="previewHtml"></div></div>
                                    <div v-if="protocolCheck" aria-live="polite" class="ui-template-check" :class="protocolCheck.ok ? 'is-ok' : 'is-error'">
                                        <svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                                            <path :d="protocolCheck.ok ? 'M20 6 9 17l-5-5' : 'M12 8v5m0 3.5h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'"></path>
                                        </svg>
                                        <span>{{ protocolCheck.ok ? protocolCheck.message : '协议检查未通过：' + protocolCheck.message }}</span>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>

                    <div v-if="tab === 'edit'" class="p-4 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 flex-shrink-0">
                        <button @click="$emit('close')" class="modal-secondary-button">取消</button>
                        <button @click="$emit('save')" class="modal-primary-button">
                            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                            保存模板
                        </button>
                    </div>
            </modal-shell>`
    };

    const WorldInfoEditorModal = {
        components: { CustomSelect },
        props: {
            show: Boolean,
            entry: { type: Object, required: true },
            editing: Boolean,
            keysText: { type: String, default: '' },
            scopeOptions: { type: Array, default: () => [] },
            positionOptions: { type: Array, default: () => [] }
        },
        emits: ['close', 'save', 'update-field', 'update-keys'],
        methods: {
            updateField(field, value) {
                this.$emit('update-field', { field, value });
            },
            updateNumber(field, value) {
                this.updateField(field, value === '' ? '' : Number(value));
            },
            updateRegexMode(checked) {
                this.updateField('useRegex', checked);
                this.$emit('update-keys', this.keysText);
            }
        },
        template: `
            <modal-shell :show="show" overlay-class="z-50 p-2 md:p-3"
                panel-class="bg-white rounded-2xl border border-gray-200 w-full max-w-3xl flex flex-col shadow-2xl max-h-[94vh] overflow-hidden">
                    <modal-header @close="$emit('close')">
                        <div class="flex items-center gap-3">
                            <div class="p-2 bg-primary-50 text-primary-600 rounded-lg">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-gray-800 leading-tight">{{ editing ? '编辑世界书' : '新建世界书' }}</h3>
                                <p class="text-xs text-gray-500">世界书条目</p>
                            </div>
                        </div>
                    </modal-header>

                    <div class="flex-1 p-6 space-y-6 bg-gray-50/30 overflow-y-auto custom-scrollbar">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">名称/备注 (Comment)</label>
                                    <input :value="entry.comment" @input="updateField('comment', $event.target.value)" type="text"
                                        class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm font-medium" placeholder="例如：主城描述">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">作用范围</label>
                                    <custom-select :model-value="entry.scope" @update:modelValue="updateField('scope', $event)" :options="scopeOptions"></custom-select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">主关键词 (Keys)</label>
                                    <input :value="keysText" @input="$emit('update-keys', $event.target.value)" type="text"
                                        class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm" placeholder="逗号分隔，留空则需勾选'常驻'">
                                    <div v-if="entry.keys && entry.keys.length" class="mt-2 flex flex-wrap gap-1.5">
                                        <span v-for="(key, keyIndex) in entry.keys" :key="'wi-key-' + keyIndex + '-' + key" :title="key"
                                            class="inline-flex items-center max-w-full rounded-xl border border-primary-100 bg-primary-50 px-2.5 py-1.5 text-xs font-bold text-primary-700 shadow-sm">
                                            <span :class="entry.useRegex ? 'break-all whitespace-normal leading-relaxed' : 'truncate'">{{ key }}</span>
                                        </span>
                                    </div>
                                </div>
                                <div class="flex flex-wrap gap-2">
                                    <label :class="['flex-1 flex items-center justify-center space-x-1.5 cursor-pointer px-3 py-1.5 border rounded-xl transition-all select-none shadow-sm active:scale-95', entry.useRegex ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-gray-200 text-gray-600 hover:border-primary-300']">
                                        <input type="checkbox" :checked="entry.useRegex" @change="updateRegexMode($event.target.checked)" class="hidden">
                                        <svg v-if="entry.useRegex" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                                        <span class="text-xs font-bold">正则匹配</span>
                                    </label>
                                    <label :class="['flex-1 flex items-center justify-center space-x-1.5 cursor-pointer px-3 py-1.5 border rounded-xl transition-all select-none shadow-sm active:scale-95', entry.constant ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-gray-200 text-gray-600 hover:border-primary-300']" title="常驻条目无需关键词触发，启用后始终插入">
                                        <input type="checkbox" :checked="entry.constant" @change="updateField('constant', $event.target.checked)" class="hidden">
                                        <svg v-if="entry.constant" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                                        <span class="text-xs font-bold">始终常驻</span>
                                    </label>
                                </div>
                            </div>

                            <div class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                                <div class="space-y-4">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">插入位置</label>
                                        <custom-select :model-value="entry.position" @update:modelValue="updateField('position', $event)" :options="positionOptions"
                                            button-class="bg-white text-sm focus:ring-4 focus:ring-primary-500/10" menu-class="text-sm"></custom-select>
                                    </div>
                                    <div class="grid grid-cols-2 gap-3">
                                        <div>
                                            <label class="block text-xs text-gray-500 mb-1">顺序</label>
                                            <input type="number" :value="entry.order" @input="updateNumber('order', $event.target.value)"
                                                class="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" placeholder="100">
                                        </div>
                                        <div>
                                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">触发概率</label>
                                            <div :class="['flex items-center border rounded-xl transition-all overflow-hidden shadow-sm', entry.useProbability ? 'border-primary-300 ring-2 ring-primary-500/10' : 'border-gray-200 opacity-60']">
                                                <button @click="updateField('useProbability', !entry.useProbability)"
                                                    :class="['px-3 py-2 transition-colors border-r', entry.useProbability ? 'bg-primary-600 text-white border-primary-600' : 'bg-gray-100 text-gray-400 border-gray-200']">
                                                    <span class="block w-4 h-4 text-sm font-bold leading-4 text-center">%</span>
                                                </button>
                                                <input type="number" :value="entry.probability" @input="updateNumber('probability', $event.target.value)" min="0" max="100"
                                                    class="w-full bg-white px-3 py-1.5 text-sm font-bold text-gray-700 focus:outline-none" :disabled="!entry.useProbability" placeholder="100">
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">自定义扫描深度</label>
                                        <input type="number" :value="entry.scanDepth" @input="updateNumber('scanDepth', $event.target.value)"
                                            class="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" placeholder="默认">
                                    </div>
                                    <div v-if="entry.position === 'at_depth'" class="pt-2 border-t border-gray-100">
                                        <label class="block text-xs text-gray-500 mb-1">插入深度 <span class="text-[10px] text-gray-400">@D</span></label>
                                        <input type="number" :value="entry.depth" @input="updateNumber('depth', $event.target.value)"
                                            class="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" placeholder="4">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex justify-between">
                                <span>内容</span>
                                <span class="text-[10px] font-normal normal-case bg-gray-100 px-1.5 rounded text-gray-500">{{ (entry.content || '').length }} 字符</span>
                            </label>
                            <textarea :value="entry.content" @input="updateField('content', $event.target.value)" rows="12"
                                class="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none text-sm shadow-inner leading-relaxed resize-y min-h-[260px]" placeholder="在此输入世界书条目的具体内容..."></textarea>
                        </div>
                    </div>

                    <div class="p-4 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0 wi-footer">
                        <button @click="$emit('close')" class="modal-secondary-button">取消</button>
                        <button @click="$emit('save')" class="modal-primary-button">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                            保存条目
                        </button>
                    </div>
            </modal-shell>`
    };

    const ExportSelectionModal = {
        props: {
            show: Boolean,
            items: { type: Array, default: () => [] },
            selected: { type: Set, required: true }
        },
        emits: ['close', 'select-all', 'deselect-all', 'toggle', 'confirm'],
        template: `
            <modal-shell :show="show" overlay-class="z-[90] p-4"
                panel-class="bg-white rounded-xl border border-gray-200 w-full max-w-lg flex flex-col shadow-2xl max-h-[80vh] overflow-hidden">
                    <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                        <h3 class="text-lg font-bold text-gray-800">选择导出项目</h3>
                        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-all">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div class="p-2 border-b border-gray-100 flex justify-between items-center bg-white">
                        <button @click="$emit('select-all')" class="px-3 py-1.5 text-xs font-bold text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">全选</button>
                        <span class="text-xs text-gray-500">已选: {{ selected.size }}</span>
                        <button @click="$emit('deselect-all')" class="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">取消全选</button>
                    </div>
                    <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                        <div v-for="(item, index) in items" :key="index" @click="$emit('toggle', index)"
                            class="flex items-center p-4 rounded-lg border cursor-pointer transition-all select-none"
                            :class="selected.has(index) ? 'bg-primary-50 border-primary-200' : 'bg-white border-gray-200 hover:border-primary-300'">
                            <div class="flex-shrink-0 mr-4">
                                <div :class="['w-6 h-6 rounded border flex items-center justify-center transition-colors', selected.has(index) ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-300']">
                                    <svg v-if="selected.has(index)" class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </div>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="font-medium text-gray-900 truncate text-base">{{ item.name || item.comment || '未命名' }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="p-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                        <button @click="$emit('close')" class="modal-secondary-button">取消</button>
                        <button @click="$emit('confirm')" :disabled="selected.size === 0"
                            class="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-all shadow-md hover:shadow-lg font-bold text-sm active:scale-95 flex items-center disabled:opacity-50 disabled:cursor-not-allowed">
                            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                            导出选中 ({{ selected.size }})
                        </button>
                    </div>
            </modal-shell>`
    };

    const CharacterExportModal = {
        props: { show: Boolean },
        emits: ['close', 'export'],
        data: () => ({
            options: [
                { type: 'json', title: '导出为 JSON 文件', description: '导出角色卡数据 .json', path: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
                { type: 'png', title: '导出为 PNG 文件', description: '导出带头像图片的角色卡 .png', path: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
                { type: 'chat', title: '导出聊天记录', description: '一次性导出当前角色的全部分支聊天 .jsonl', path: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' }
            ]
        }),
        template: `
            <modal-shell :show="show" close-on-backdrop @close="$emit('close')"
                overlay-class="z-[90] p-4"
                panel-class="compact-modal-panel">
                    <div class="choice-modal">
                        <div class="choice-modal__head">
                            <h3>导出选项</h3>
                            <button type="button" @click="$emit('close')" class="modal-close-button" aria-label="关闭">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div class="choice-modal__list">
                            <button v-for="option in options" :key="option.type" type="button" @click="$emit('export', option.type)" class="choice-card">
                                <span class="choice-card__icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="option.path"></path></svg></span>
                                <span class="choice-card__body"><span class="choice-card__title">{{ option.title }}</span><span class="choice-card__desc">{{ option.description }}</span></span>
                            </button>
                        </div>
                    </div>
            </modal-shell>`
    };

    const ActionConfirmModal = {
        props: {
            show: Boolean,
            message: { type: String, default: '' }
        },
        emits: ['confirm', 'cancel'],
        template: `
            <modal-shell :show="show" overlay-class="z-[160] p-4"
                panel-class="bg-white rounded-xl border border-gray-200 w-full max-w-sm flex flex-col shadow-2xl transform transition-all scale-100">
                    <div class="p-6 text-center">
                        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                            <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                            </svg>
                        </div>
                        <h3 class="text-lg font-medium text-gray-900 mb-2">确认操作</h3>
                        <p class="text-sm text-gray-500 whitespace-pre-wrap" v-html="message"></p>
                    </div>
                    <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse rounded-b-xl">
                        <button @click="$emit('confirm')" type="button" class="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm transition-colors">确认</button>
                        <button @click="$emit('cancel')" type="button" class="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors">取消</button>
                    </div>
            </modal-shell>`
    };

    const RetryConfirmModal = {
        props: { state: { type: Object, required: true } },
        template: `
            <modal-shell :show="state.show" overlay-class="z-[200] px-4 pt-4 pb-20 text-center sm:p-0"
                    panel-class="bg-white rounded-2xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.15)] transform transition-transform w-full max-w-sm overflow-hidden relative z-10 border border-gray-100 p-6 flex flex-col items-center animate-slide-up">
                        <div class="w-12 h-12 rounded-full bg-yellow-50 flex items-center justify-center mb-4 border border-yellow-100 shadow-sm">
                            <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                            </svg>
                        </div>
                        <h3 class="text-lg font-bold text-gray-900 mb-2 tracking-tight">{{ state.title }}</h3>
                        <p class="text-[13px] text-gray-500 mb-6 whitespace-pre-wrap leading-relaxed px-2">{{ state.message }}</p>
                        <div class="flex space-x-3 w-full">
                            <button @click="state.onCancel" class="flex-1 py-2.5 px-4 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold rounded-xl transition-all border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-300 hover:-translate-y-0.5">取消中断</button>
                            <button @click="state.onConfirm" class="flex-1 py-2.5 px-4 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-primary-400 hover:-translate-y-0.5">立即重试</button>
                        </div>
            </modal-shell>`
    };

    const ContextViewerModal = {
        props: {
            show: Boolean,
            floors: { type: Number, default: 0 },
            totalLength: { type: Number, default: 0 },
            worldInfos: { type: Array, default: () => [] },
            messages: { type: Array, default: () => [] }
        },
        emits: ['close'],
        setup(props) {
            const roleLabels = { system: '系统提示词', memory: '记忆', user: '用户', assistant: 'AI', tool: '工具' };
            const getRoleKey = message => message.isMemory ? 'memory' : (roleLabels[message.role] ? message.role : 'system');
            // 统计时对话楼层里的用户和 AI 合并为“原文”，预注入、角色设定这类不在楼层里的消息算系统提示词；
            // 世界书正文从所在消息里拆出来单独计数；消息条的颜色跟统计分类一致。
            const compositionLabels = { system: '系统提示词', worldinfo: '世界书', memory: '记忆', original: '原文', tool: '工具' };
            const getCompositionKey = message => {
                const key = getRoleKey(message);
                if (!['user', 'assistant'].includes(key)) return key;
                return message.floor ? 'original' : 'system';
            };
            const openIndexes = ref(new Set());
            watch(() => props.messages, () => { openIndexes.value = new Set(); });
            // 各类消息占了多少字，一眼看出上下文主要花在哪里。
            const composition = computed(() => {
                const totals = {};
                props.messages.forEach(message => {
                    const key = getCompositionKey(message);
                    const worldInfoChars = Number(message.worldInfoChars) || 0;
                    totals[key] = (totals[key] || 0) + String(message.content || '').length - worldInfoChars;
                    totals.worldinfo = (totals.worldinfo || 0) + worldInfoChars;
                });
                const sum = Object.values(totals).reduce((total, value) => total + value, 0) || 1;
                return Object.keys(compositionLabels).filter(key => totals[key] > 0)
                    .map(key => ({ key, label: compositionLabels[key], chars: totals[key], share: totals[key] / sum * 100 }));
            });
            const toggle = index => {
                const next = new Set(openIndexes.value);
                if (!next.delete(index)) next.add(index);
                openIndexes.value = next;
            };
            const preview = message => String(message.content || '').replace(/\s+/g, ' ').trim().slice(0, 120);
            // 不在对话楼层里的用户 / AI 消息是预注入，用灰字标出来代替楼层号。
            const isPreInjection = message => !message.floor && ['user', 'assistant'].includes(getRoleKey(message));
            const triggerText = item => (!item.triggers || item.triggers === '常驻' || item.name?.includes('记忆'))
                ? item.triggers : `触发：${item.triggers}`;
            return { roleLabels, getRoleKey, getCompositionKey, openIndexes, composition, toggle, preview, isPreInjection, triggerText };
        },
        template: `
            <modal-shell :show="show" close-on-backdrop @close="$emit('close')"
                overlay-class="z-[100] p-3 sm:p-6"
                panel-class="ctx-viewer w-full max-w-4xl flex flex-col overflow-hidden max-h-[90vh] sm:max-h-[85vh]">
                    <modal-header @close="$emit('close')">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                </svg>
                            </div>
                            <div class="min-w-0">
                                <h3 class="text-lg font-bold text-gray-800 leading-tight">上下文查看器</h3>
                                <p class="mt-0.5 text-xs text-gray-500 truncate">{{ floors }} 楼 · {{ Number(totalLength || 0).toLocaleString() }} 字</p>
                            </div>
                        </div>
                    </modal-header>

                    <div class="ctx-viewer__body custom-scrollbar">
                        <section v-if="composition.length" class="ctx-section">
                            <div class="usage-meter" aria-hidden="true">
                                <span v-for="part in composition" :key="part.key" :class="'ctx-tone--' + part.key" :style="{ flexGrow: part.share }"></span>
                            </div>
                            <ul class="ctx-legend">
                                <li v-for="part in composition" :key="part.key">
                                    <i class="usage-swatch" :class="'ctx-tone--' + part.key"></i>{{ part.label }}<b>{{ part.chars.toLocaleString() }}</b>
                                </li>
                            </ul>
                        </section>

                        <section class="ctx-section">
                            <h4 class="ctx-section__title">插入的世界书<span class="ctx-count">{{ worldInfos.length }}</span></h4>
                            <div v-if="worldInfos.length" class="ctx-tags">
                                <span v-for="(item, index) in worldInfos" :key="'wi-' + index" class="ctx-tag">
                                    <b>{{ item.name }}</b><small v-if="item.triggers">{{ triggerText(item) }}</small>
                                </span>
                            </div>
                            <p v-else class="ctx-muted">没有触发世界书，或世界书功能已关闭。</p>
                        </section>

                        <section class="ctx-section">
                            <h4 class="ctx-section__title">消息<span class="ctx-count">{{ messages.length }}</span></h4>
                            <ol v-if="messages.length" class="ctx-messages">
                                <li v-for="(message, index) in messages" :key="index" class="ctx-message" :class="'ctx-tone--' + getCompositionKey(message)">
                                    <button type="button" class="ctx-message__head" :aria-expanded="openIndexes.has(index)" @click="toggle(index)">
                                        <span class="ctx-role">{{ roleLabels[getRoleKey(message)] }}</span>
                                        <span v-if="message.floor" class="ctx-floor">F{{ message.floor }}</span>
                                        <span v-else-if="isPreInjection(message)" class="ctx-floor is-text">预注入</span>
                                        <span class="ctx-preview">{{ preview(message) }}</span>
                                        <span class="ctx-length">{{ String(message.content || '').length.toLocaleString() }} 字</span>
                                        <svg class="ctx-chevron" :class="{ 'is-open': openIndexes.has(index) }" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </button>
                                    <div v-if="message.wiTriggers && message.wiTriggers.length" class="ctx-tags ctx-message__tags">
                                        <span v-for="(trigger, triggerIndex) in message.wiTriggers" :key="triggerIndex" class="ctx-tag">
                                            <b>{{ trigger.name }}</b><small v-if="trigger.triggers">{{ triggerText(trigger) }}</small>
                                        </span>
                                    </div>
                                    <div v-if="openIndexes.has(index)" class="ctx-message__body">
                                        <div class="ctx-content custom-scrollbar" v-html="message.renderedContent"></div>
                                    </div>
                                </li>
                            </ol>
                            <div v-else class="empty-state">
                                <svg fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                <p>暂无上下文记录</p>
                                <small>发送一条消息后，这里会显示实际发给模型的内容</small>
                            </div>
                        </section>
                    </div>
            </modal-shell>`
    };

    const TokenUsageView = {
        components: { PaginationControls, SettingsHelp, SettingsPageHeader },
        props: {
            show: Boolean,
            historyLength: { type: Number, default: 0 },
            filter: { type: String, default: 'all' },
            timeFilter: { type: String, default: 'all' },
            showTimeFilter: Boolean,
            timeFilterLabel: { type: String, default: '' },
            timeFilterOptions: { type: Array, default: () => [] },
            stats: { type: Object, default: () => ({}) },
            filteredCount: { type: Number, default: 0 },
            records: { type: Array, default: () => [] },
            page: { type: Number, default: 1 },
            pageCount: { type: Number, default: 1 },
            helpTopic: { type: String, default: '' },
            formatAggregate: { type: Function, required: true },
            formatCount: { type: Function, required: true },
            formatTime: { type: Function, required: true },
            getCategory: { type: Function, required: true },
            getUncachedInput: { type: Function, required: true }
        },
        emits: [
            'menu', 'clear', 'update:filter', 'update:time-filter', 'update:show-time-filter',
            'update:page', 'update:help-topic'
        ],
        setup(props) {
            const filterOptions = Object.freeze([
                { value: 'all', label: '全部', position: '' },
                { value: 'chat', label: '主对话', position: 'is-position-2' },
                { value: 'memory', label: '记忆系统', position: 'is-position-3' },
                { value: 'variables', label: '变量分析', position: 'is-position-4' }
            ]);
            // The meter splits the total into tokens sent fresh, tokens the cache served and tokens returned.
            const parts = computed(() => [
                { key: 'input', label: '输入', value: props.stats.inputTokens, reports: props.stats.inputTokensReports },
                { key: 'cache', label: '缓存', value: props.stats.cacheReadTokens, reports: props.stats.cacheReadTokensReports },
                { key: 'output', label: '输出', value: props.stats.outputTokens, reports: props.stats.outputTokensReports }
            ]);
            const total = computed(() => parts.value.reduce((sum, part) => sum + (part.value || 0), 0));
            const totalReports = computed(() => parts.value.reduce((sum, part) => sum + (part.reports || 0), 0));
            const formatDuration = (value) => {
                if (!Number.isFinite(value)) return '';
                if (value < 1000) return `${Math.round(value)}ms`;
                return `${Number((value / 1000).toFixed(1))}s`;
            };
            const formatOutputSpeed = (record) => {
                if (record?.isStream !== true
                    || !Number.isFinite(record?.durationMs) || record.durationMs <= 0
                    || !Number.isFinite(record?.outputCharacters) || record.outputCharacters <= 0) return '';
                return `${Math.round(record.outputCharacters * 1000 / record.durationMs)} 字/s`;
            };
            return {
                filterOptions,
                formatDuration,
                formatOutputSpeed,
                formatQuota: quota => `¥${(Math.trunc(quota / 500000 * 10000) / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`,
                parts,
                total,
                totalReports,
                typeLabels: Object.fromEntries(filterOptions.map(option => [option.value, option.label]))
            };
        },
        template: `
            <div v-if="show" class="management-view">
                <settings-page-header title="用量统计" @menu="$emit('menu')">
                    <template #icon>
                        <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 19V9m5 10V5m5 14v-7m5 7V3M3 21h18"></path>
                        </svg>
                    </template>
                    <button v-if="historyLength > 0" @click="$emit('clear')" class="settings-icon-button text-red-600"
                        title="清空记录" aria-label="清空 Token 用量记录">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </settings-page-header>

                <div class="usage-toolbar">
                    <div class="segmented-switch segmented-switch--compact segmented-switch--four min-w-0 flex-1">
                        <div class="segmented-switch__indicator" :class="filterOptions.find(option => option.value === filter)?.position"></div>
                        <button v-for="option in filterOptions" :key="option.value" type="button"
                            @click="$emit('update:filter', option.value)" class="segmented-switch__option"
                            :class="{ 'is-active': filter === option.value }">{{ option.label }}</button>
                    </div>
                    <div class="token-usage-time-filter-container relative flex-none">
                        <button type="button" @click="$emit('update:show-time-filter', !showTimeFilter)"
                            class="usage-range-button"
                            aria-label="筛选 Token 记录时间范围" :aria-expanded="showTimeFilter">
                            <svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>
                            </svg>
                            {{ timeFilterLabel }}
                        </button>
                        <transition name="dropdown">
                            <div v-if="showTimeFilter" class="usage-range-menu" role="menu">
                                <button v-for="option in timeFilterOptions" :key="option.value" type="button" role="menuitemradio"
                                    :aria-checked="timeFilter === option.value" :class="{ 'is-active': timeFilter === option.value }"
                                    @click="$emit('update:time-filter', option.value); $emit('update:show-time-filter', false)">
                                    {{ option.label }}
                                    <svg v-if="timeFilter === option.value" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </button>
                            </div>
                        </transition>
                    </div>
                </div>

                <section class="summary-card" aria-label="用量概览">
                    <dl class="summary-facts">
                        <div>
                            <dt>
                                总用量
                                <settings-help topic="totalTokens" :open-topic="helpTopic" label="查看总用量说明" icon-class=""
                                    popover-class="token-usage-help-popover" @toggle="$emit('update:help-topic', $event)">
                                    汇总当前类型和时间筛选范围内，输入 Token（包括缓存读取）与输出 Token 的总和。
                                </settings-help>
                            </dt>
                            <dd>{{ formatAggregate(total, totalReports) }}<small>tokens</small></dd>
                        </div>
                        <div><dt>请求</dt><dd>{{ filteredCount }}<small>次</small></dd></div>
                    </dl>
                    <div class="usage-meter" aria-hidden="true">
                        <span v-for="part in parts" :key="part.key" :class="'usage-tone--' + part.key" :style="{ flexGrow: part.value || 0 }"></span>
                    </div>
                    <ul class="usage-legend">
                        <li v-for="part in parts" :key="part.key">
                            <i class="usage-swatch" :class="'usage-tone--' + part.key"></i>{{ part.label }}<b>{{ formatAggregate(part.value, part.reports) }}</b>
                        </li>
                    </ul>
                </section>

                <div class="list-heading">
                    <h3>请求日志</h3>
                    <span>共 {{ filteredCount }} 条</span>
                </div>
                <template v-if="records.length > 0">
                    <ol class="list-card">
                        <li v-for="record in records" :key="record.id" class="usage-row">
                            <div class="usage-row__main">
                                <div class="usage-row__model" :title="record.model">{{ record.model || '未知模型' }}</div>
                                <div class="usage-row__meta">
                                    <span class="usage-type" :class="'usage-type--' + getCategory(record.type)">{{ typeLabels[getCategory(record.type)] }}</span>
                                    <time>{{ formatTime(record.timestamp) }}</time>
                                    <span v-if="formatDuration(record.durationMs)">{{ formatDuration(record.durationMs) }}</span>
                                    <span v-if="formatOutputSpeed(record)">{{ formatOutputSpeed(record) }}</span>
                                </div>
                            </div>
                            <dl class="usage-row__stats">
                                <div><dt><i class="usage-swatch usage-tone--input"></i>输入</dt><dd>{{ formatCount(getUncachedInput(record)) }}</dd></div>
                                <div><dt><i class="usage-swatch usage-tone--cache"></i>缓存</dt><dd :class="{ 'is-empty': !(record.cacheReadTokens > 0) }">{{ record.cacheReadTokens > 0 ? formatCount(record.cacheReadTokens) : '—' }}</dd></div>
                                <div><dt><i class="usage-swatch usage-tone--output"></i>输出</dt><dd>{{ formatCount(record.outputTokens) }}</dd></div>
                                <div class="usage-row__stat-cost" :title="record.usageGroup ? '计费分组：' + record.usageGroup : ''">
                                    <dt><i class="usage-swatch usage-tone--cost"></i>消耗</dt>
                                    <dd :class="{ 'is-empty': !Number.isFinite(record.actualQuota) }">{{ Number.isFinite(record.actualQuota) ? formatQuota(record.actualQuota) : '—' }}</dd>
                                </div>
                            </dl>
                            <span v-if="Number.isFinite(record.actualQuota)" class="usage-row__cost"
                                :title="'本次消耗' + (record.usageGroup ? '，计费分组：' + record.usageGroup : '')">{{ formatQuota(record.actualQuota) }}</span>
                        </li>
                    </ol>
                    <pagination-controls class="mt-4" :current="page" :total="pageCount" label="Token 记录分页" @change="$emit('update:page', $event)"></pagination-controls>
                </template>
                <div v-else class="empty-state">
                    <svg fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 19V9m5 10V5m5 14v-7m5 7V3M3 21h18"></path>
                    </svg>
                    <p>{{ historyLength > 0 ? '当前筛选范围还没有记录' : '还没有 Token 用量记录' }}</p>
                    <small>{{ historyLength > 0 ? '可以切换其他分类或时间范围查看' : '完成一次 API 请求后会显示在这里' }}</small>
                </div>
            </div>`
    };

    const UiTemplatesView = {
        components: { SettingsHelp, SettingsPageHeader },
        props: {
            show: Boolean,
            templates: { type: Array, default: () => [] },
            hasCharacter: Boolean,
            showSettings: Boolean,
            settings: { type: Object, required: true },
            updateStatus: { type: Object, required: true },
            helpTopic: String,
            analysisDepth: Number
        },
        emits: [
            'menu', 'export', 'import', 'create', 'update:show-settings', 'update:help-topic',
            'analyze', 'select-model', 'update:analysis-depth', 'edit', 'delete'
        ],
        template: `
            <div v-if="show" class="management-view">
                <settings-page-header title="UI模板" @menu="$emit('menu')">
                    <template #icon>
                        <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5"></path>
                        </svg>
                    </template>
                    <button @click="$emit('export')" :disabled="templates.length === 0"
                        class="settings-icon-button disabled:opacity-40" title="导出">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-export"></use></svg>
                    </button>
                    <label class="settings-icon-button cursor-pointer" title="导入">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-import"></use></svg>
                        <input type="file" accept=".json" @change="$emit('import', $event)" class="hidden">
                    </label>
                    <button @click="$emit('create')" class="settings-create-button" title="新建模板">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                    </button>
                </settings-page-header>

                <div class="bg-white/70 backdrop-blur-sm p-1 rounded-2xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
                    <button @click="$emit('update:show-settings', !showSettings); $emit('update:help-topic', '')"
                        class="settings-collapse-trigger" aria-controls="ui-template-settings-panel"
                        :aria-expanded="showSettings"
                        :class="['w-full flex justify-between items-center px-4 py-3 rounded-xl font-bold',
                            showSettings ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50']">
                        <span class="flex items-center min-w-0">
                            <span :class="['p-1.5 rounded-lg mr-3 transition-colors', showSettings ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500']">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5"></path>
                                </svg>
                            </span>
                            <span class="truncate">变量系统设置</span>
                            <span v-if="updateStatus.state !== 'idle'"
                                class="ml-2 inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full border"
                                :class="{
                                    'bg-blue-50 text-blue-700 border-blue-200': updateStatus.state === 'running',
                                    'bg-green-50 text-green-700 border-green-200': updateStatus.state === 'success',
                                    'bg-yellow-50 text-yellow-700 border-yellow-200': updateStatus.state === 'skipped',
                                    'bg-red-50 text-red-700 border-red-200': updateStatus.state === 'error'
                                }">
                                {{ updateStatus.message }}
                            </span>
                        </span>
                        <span class="flex items-center flex-shrink-0">
                            <svg :class="{'transform rotate-180': showSettings}"
                                class="settings-collapse-chevron w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </span>
                    </button>
                    <div id="ui-template-settings-panel" class="settings-collapse"
                        :class="{ 'is-open': showSettings }" :aria-hidden="!showSettings" :inert="!showSettings">
                        <div class="settings-collapse__inner">
                            <div class="settings-collapse__content px-4 pb-4 pt-3 border-t border-gray-100">
                                <div class="flex items-center justify-between mb-4">
                                    <div class="flex items-center space-x-3">
                                        <span class="text-sm font-bold text-gray-700">变量分析</span>
                                        <label class="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" v-model="settings.uiTemplateEnabled" class="settings-toggle-input sr-only">
                                            <div class="settings-toggle settings-toggle--compact"></div>
                                        </label>
                                    </div>
                                    <div class="flex items-center justify-end gap-2 min-h-[30px]">
                                        <button @click="$emit('analyze')" :disabled="!settings.uiTemplateEnabled"
                                            class="inline-flex items-center text-xs px-3 py-1.5 bg-white hover:bg-primary-50 text-primary-700 rounded-lg border border-primary-200 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed font-medium active:scale-95"
                                            :class="settings.uiTemplateMainModelAnalysis ? 'invisible opacity-0 pointer-events-none' : 'visible opacity-100'">
                                            <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                            </svg>
                                            <span>立即分析</span>
                                        </button>
                                    </div>
                                </div>
                                <div v-if="settings.uiTemplateEnabled" class="mb-3 animate-fade-in">
                                    <div class="segmented-switch segmented-switch--compact w-full">
                                        <div class="segmented-switch__indicator" :class="{ 'is-right': !settings.uiTemplateMainModelAnalysis }"></div>
                                        <button type="button" @click="settings.uiTemplateMainModelAnalysis = true"
                                            class="segmented-switch__option" :class="{ 'is-active': settings.uiTemplateMainModelAnalysis }">主模型</button>
                                        <button type="button" @click="settings.uiTemplateMainModelAnalysis = false"
                                            class="segmented-switch__option" :class="{ 'is-active': !settings.uiTemplateMainModelAnalysis }">副模型</button>
                                    </div>
                                </div>
                                <div v-if="settings.uiTemplateEnabled && !settings.uiTemplateMainModelAnalysis"
                                    class="flex items-center justify-between py-4 border-t border-gray-100 animate-fade-in">
                                    <div class="flex items-center space-x-3">
                                        <span class="text-sm font-bold text-gray-700">将变量注入上下文</span>
                                        <label class="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" v-model="settings.uiTemplateInjectContext" class="settings-toggle-input sr-only">
                                            <div class="settings-toggle settings-toggle--compact"></div>
                                        </label>
                                    </div>
                                </div>
                                <div v-if="settings.uiTemplateEnabled && !settings.uiTemplateMainModelAnalysis" class="settings-fields animate-fade-in">
                                    <div class="settings-field">
                                        <div class="relative mb-1.5 flex items-center">
                                            <label class="text-sm font-semibold text-gray-700">分析模型</label>
                                            <settings-help topic="analysisModel" :open-topic="helpTopic"
                                                label="查看分析模型说明" @toggle="$emit('update:help-topic', $event)">
                                                仅在使用副模型分析时生效。它负责阅读对话并更新 UI 模板变量，不参与正文回复。模型速度会影响分析等待时间，结构化输出能力会影响变量更新是否准确。
                                            </settings-help>
                                        </div>
                                        <div class="flex gap-2">
                                            <button @click="$emit('select-model')" class="settings-model-button truncate"
                                                :title="settings.uiTemplateModel || '未选择模型'">
                                                <span :class="settings.uiTemplateModel ? 'text-gray-700' : 'text-gray-400'">{{ settings.uiTemplateModel || '未选择模型' }}</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="settings-field">
                                        <div class="flex justify-between items-center mb-2">
                                            <div class="relative flex items-center">
                                                <label class="text-sm font-semibold text-gray-700">分析对话层数</label>
                                                <settings-help topic="analysisDepth" :open-topic="helpTopic"
                                                    label="查看分析对话层数说明" popover-class="is-above"
                                                    @toggle="$emit('update:help-topic', $event)">
                                                    决定副模型分析时读取最近多少层对话。层数越多，能看到的剧情变化越完整，消耗越多；层数越少，消耗越少，但可能看不到较早发生的剧情
                                                </settings-help>
                                            </div>
                                            <span class="text-xs font-mono font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 whitespace-nowrap">
                                                {{ analysisDepth + ' 层' }}
                                            </span>
                                        </div>
                                        <input type="range" :value="analysisDepth"
                                            @input="$emit('update:analysis-depth', Number($event.target.value))"
                                            min="4" max="10" step="1"
                                            class="compact-range w-full h-1.5 bg-primary-100 rounded-lg appearance-none cursor-pointer accent-primary-500">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="templates.length === 0" class="empty-state">
                    <svg fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5"></path>
                    </svg>
                    <p>{{ hasCharacter ? '当前没有UI模板' : '请先选择角色卡' }}</p>
                    <small>{{ hasCharacter ? '点右上角 + 新建模板，或导入 JSON' : '选择角色卡后可以为它添加专属模板' }}</small>
                </div>
                <div v-else class="sortable-list ui-template-list">
                    <div v-for="(template, index) in templates" :key="template.id"
                        class="sortable-list-item" :class="{ 'is-off': template.enabled === false }">
                        <div class="sortable-item-main">
                            <svg class="w-7 h-7 mr-3 flex-shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5"></path>
                            </svg>
                            <div class="min-w-0">
                                <div class="sortable-item-heading">
                                    <h3 class="truncate" :title="template.name">{{ template.name }}</h3>
                                    <span class="meta-badge meta-badge--desktop"
                                        :class="template.scope === 'global' ? 'meta-badge--global' : 'meta-badge--bound'">
                                        {{ template.scope === 'global' ? '全局' : '绑定' }}
                                    </span>
                                </div>
                                <p class="text-xs text-gray-500 mt-1 truncate">{{ template.placement === 'bottom' ? '对话底部' : '对话顶部' }} · {{ Object.keys(template.variableState || {}).length }} 个变量 · {{ (template.changeLog || []).length }} 次变更</p>
                            </div>
                        </div>
                        <div class="sortable-item-actions">
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" v-model="template.enabled" class="settings-toggle-input sr-only" :aria-label="'启用模板：' + template.name">
                                <div class="settings-toggle settings-toggle--compact settings-toggle--solid"></div>
                            </label>
                            <div class="sortable-item-buttons">
                                <button @click="$emit('edit', index)" class="item-action-button item-action-button--edit" title="编辑">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-edit"></use></svg>
                                </button>
                                <button @click="$emit('delete', index)" class="item-action-button item-action-button--delete" title="删除">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`
    };

    const StoryBranchModal = {
        props: {
            show: Boolean,
            currentBranch: Object,
            branches: { type: Array, default: () => [] },
            routeMap: { type: Object, default: () => ({ width: 0, height: 0, nodes: [], links: [] }) },
            dragging: Boolean,
            selectedNode: Object,
            switching: Boolean,
            canDelete: Boolean,
            showNameEditor: Boolean,
            nameDraft: { type: String, default: '' }
        },
        emits: [
            'close', 'start-drag', 'move-drag', 'end-drag', 'select-node', 'switch-branch',
            'open-name-editor', 'delete-branch', 'close-name-editor', 'update:name-draft', 'save-name'
        ],
        template: `
            <modal-shell :show="show" close-on-backdrop @close="$emit('close')"
                overlay-class="z-[120] p-4 sm:p-6"
                    panel-class="w-full max-w-6xl h-[92vh] sm:h-[88vh] bg-white rounded-2xl shadow-2xl border border-gray-200/70 overflow-hidden flex flex-col">
                        <div class="px-5 sm:px-6 py-4 border-b border-gray-100 bg-white flex items-center justify-between flex-shrink-0">
                            <div class="min-w-0">
                                <div class="flex items-center gap-2.5">
                                    <div class="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <use href="#icon-story-branch"></use>
                                        </svg>
                                    </div>
                                    <div class="min-w-0">
                                        <h3 class="text-lg font-bold text-gray-800">剧情分支</h3>
                                        <p class="text-xs text-gray-500 mt-0.5 truncate">当前分支：{{ currentBranch?.name || '主线' }}</p>
                                    </div>
                                </div>
                            </div>
                            <button @click="$emit('close')"
                                class="w-9 h-9 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors flex-shrink-0">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>

                        <div class="story-route-modal-body custom-scrollbar">
                            <section class="story-route-map-panel">
                                <div class="story-route-map-scroll custom-scrollbar"
                                    :class="{ 'is-single-route': branches.length === 1, 'is-dragging': dragging }"
                                    @pointerdown="$emit('start-drag', $event)" @pointermove="$emit('move-drag', $event)"
                                    @pointerup="$emit('end-drag', $event)" @pointercancel="$emit('end-drag', $event)"
                                    @lostpointercapture="$emit('end-drag', $event)" @dragstart.prevent>
                                    <div class="story-route-canvas"
                                        :style="{ width: routeMap.width + 'px', height: routeMap.height + 'px' }">
                                        <svg class="story-route-links" :width="routeMap.width" :height="routeMap.height"
                                            :viewBox="'0 0 ' + routeMap.width + ' ' + routeMap.height" aria-hidden="true">
                                            <path v-for="link in routeMap.links" :key="link.id" :d="link.path"
                                                class="story-route-link"
                                                :class="{ 'is-active': link.isActive, 'is-selected': link.isSelected }"></path>
                                        </svg>
                                        <button v-for="node in routeMap.nodes" :key="node.id"
                                            @click="$emit('select-node', node.id)" class="story-route-node"
                                            :class="{ 'is-current': node.isActive, 'is-selected': node.isSelected, 'is-on-route': node.isOnActiveRoute, 'is-on-selected-route': node.isOnSelectedRoute }"
                                            :style="{ left: node.x + 'px', top: node.y + 'px' }"
                                            :title="'选择分支：' + node.name">
                                            <span class="story-route-node-checkpoint" aria-hidden="true"></span>
                                            <span class="story-route-node-copy">
                                                <span v-if="node.id === 'main'" class="story-route-node-type">起点</span>
                                                <strong>{{ node.name }}</strong>
                                                <small>{{ node.floorCount }} 楼 · {{ node.wordCountText }} 字</small>
                                            </span>
                                            <span v-if="node.isActive" class="story-route-node-current">当前</span>
                                        </button>
                                    </div>
                                </div>
                            </section>

                            <div class="story-route-actions">
                                <button @click="$emit('switch-branch', selectedNode.id)"
                                    :disabled="switching || !selectedNode || selectedNode.isActive"
                                    class="story-route-enter-button"
                                    :title="selectedNode?.isActive ? '已在当前分支' : '进入当前选中的分支'">
                                    {{ switching ? '切换中' : '进入' }}
                                </button>
                                <button @click="$emit('open-name-editor')"
                                    :disabled="switching || !selectedNode || selectedNode.id === 'main'"
                                    class="story-route-edit-button"
                                    :title="!selectedNode ? '请先选择分支' : selectedNode.id === 'main' ? '主线名称不可修改' : '编辑当前选中的分支名称'">
                                    编辑
                                </button>
                                <button @click="$emit('delete-branch')" :disabled="switching || !canDelete"
                                    :title="canDelete ? '删除当前选中的分支' : '请选择可删除的分支（主线不可删除）'"
                                    class="story-route-delete-button">删除</button>
                            </div>
                        </div>
            </modal-shell>

            <modal-shell :show="showNameEditor" close-on-backdrop @close="$emit('close-name-editor')"
                overlay-class="z-[180] p-4"
                    panel-class="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
                        <h3 class="text-lg font-bold text-gray-800">编辑分支名称</h3>
                        <p class="mt-1 text-sm text-gray-500">名称最多 30 个字。</p>
                        <input :value="nameDraft" maxlength="30" autofocus
                            @input="$emit('update:name-draft', $event.target.value)"
                            @keyup.enter="$emit('save-name')" @keyup.esc="$emit('close-name-editor')"
                            class="mt-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            placeholder="输入分支名称">
                        <div class="mt-5 flex justify-end gap-2">
                            <button @click="$emit('close-name-editor')"
                                class="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 transition hover:bg-gray-50">取消</button>
                            <button @click="$emit('save-name')" :disabled="switching"
                                class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">保存</button>
                        </div>
            </modal-shell>`
    };

    const CharacterCard = {
        props: {
            char: { type: Object, required: true },
            mobile: Boolean,
            deck: Boolean,
            active: Boolean,
            loading: Boolean,
            batchMode: Boolean,
            selected: Boolean,
            favorite: Boolean,
            worldInfoCount: { type: Number, default: 0 },
            regexCount: { type: Number, default: 0 }
        },
        emits: ['select', 'edit', 'export-card', 'toggle-favorite', 'delete-card'],
        setup() {
            let pressStartedAt = 0;
            let releaseTimer = null;
            let cleanupTimer = null;
            let coverZoomStartedAt = 0;
            let coverZoomTimer = null;

            const clearCardTimers = () => {
                clearTimeout(releaseTimer);
                clearTimeout(cleanupTimer);
                clearTimeout(coverZoomTimer);
            };
            const beginCoverZoom = (event) => {
                if (event.pointerType !== 'mouse') return;
                clearTimeout(coverZoomTimer);
                const card = event.currentTarget;
                if (!card.classList.contains('is-cover-zoomed')) coverZoomStartedAt = performance.now();
                card.classList.add('is-cover-zoomed');
            };
            const endCoverZoom = (event) => {
                if (event.pointerType !== 'mouse') return;
                const card = event.currentTarget;
                clearTimeout(coverZoomTimer);
                coverZoomTimer = setTimeout(() => card.classList.remove('is-cover-zoomed'),
                    Math.max(0, 400 - (performance.now() - coverZoomStartedAt)));
            };
            const beginPress = (event) => {
                clearCardTimers();
                const card = event.currentTarget;
                card.classList.remove('is-card-releasing');
                card.classList.add('is-card-pressing');
                pressStartedAt = performance.now();
            };
            const endPress = (event) => {
                const card = event.currentTarget;
                if (!card.classList.contains('is-card-pressing')) return;
                clearTimeout(releaseTimer);
                releaseTimer = setTimeout(() => {
                    card.classList.remove('is-card-pressing');
                    card.classList.add('is-card-releasing');
                    cleanupTimer = setTimeout(() => card.classList.remove('is-card-releasing'), 180);
                }, Math.max(0, 120 - (performance.now() - pressStartedAt)));
            };

            onBeforeUnmount(clearCardTimers);
            return { beginCoverZoom, endCoverZoom, beginPress, endPress };
        },
        template: `
            <div class="char-grid-item relative rounded-2xl overflow-hidden transition-[transform,shadow,border-color] duration-300"
                :class="mobile
                    ? ['aspect-[2/3] shadow-md', deck ? 'character-card--deck' : 'border border-gray-100', active && !batchMode && !deck ? 'ring-4 ring-primary-500 ring-offset-2' : '']
                    : ['bg-white border border-gray-200 hover:border-primary-400 hover:shadow-xl cursor-pointer group shadow-sm flex flex-col', active && !batchMode ? 'ring-4 ring-primary-500 ring-offset-2' : '', batchMode && selected ? 'ring-2 ring-red-500 border-red-500' : '']"
                :aria-busy="loading"
                @pointerenter="!deck && beginCoverZoom($event)" @pointerdown="!deck && beginPress($event)" @pointerup="endPress"
                @pointercancel="endPress" @pointerleave="endPress($event); endCoverZoom($event)"
                @click="!deck && !loading && $emit('select')">
                <div v-if="loading && !batchMode" @click.stop role="status" aria-live="polite"
                    class="absolute inset-0 z-40 flex items-center justify-center bg-gray-950/45 backdrop-blur-[2px]">
                    <div class="flex flex-col items-center gap-3 text-white drop-shadow-md">
                        <svg class="generated-image-spinner character-switch-spinner" viewBox="0 0 50 50" aria-hidden="true">
                            <circle class="generated-image-spinner-path" cx="25" cy="25" r="20" fill="none" stroke-width="3"></circle>
                        </svg>
                        <span class="text-sm font-semibold tracking-wide">正在切换</span>
                    </div>
                </div>
                <template v-if="mobile">
                    <div v-if="deck" class="character-deck__placeholder" aria-hidden="true">{{ (char.name || '角').slice(0, 1) }}</div>
                    <img v-if="!deck || char?.avatar" :src="char?.avatar" :alt="char.name" draggable="false"
                        class="absolute inset-0 w-full h-full object-cover" :loading="deck ? 'eager' : 'lazy'" decoding="async">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

                    <div v-if="batchMode" class="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                        <div class="w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors"
                            :class="selected ? 'bg-red-500 border-red-500' : 'bg-white/20 border-white/50'">
                            <svg v-if="selected" class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                        </div>
                    </div>

                    <div v-if="active && !batchMode" class="absolute top-3 left-3 z-10">
                        <div class="flex items-center text-xs font-bold text-white bg-green-600/60 backdrop-blur-xl px-3 py-1.5 rounded-full border border-white/30 shadow-lg">
                            <span class="w-2 h-2 bg-green-400 rounded-full mr-2 shadow-[0_0_5px_rgba(74,222,128,0.8)]"></span>
                            当前使用
                        </div>
                    </div>

                    <div v-if="!batchMode" class="character-card-actions absolute top-3 right-3 flex flex-col gap-2 z-20">
                        <button @click.stop="$emit('edit')"
                            title="编辑角色" aria-label="编辑角色"
                            class="p-2 bg-white/20 backdrop-blur-md text-white rounded-full border border-white/20 active:bg-white/40 shadow-lg">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                            </svg>
                        </button>
                        <button @click.stop="$emit('export-card')"
                            title="导出角色" aria-label="导出角色"
                            class="p-2 bg-white/20 backdrop-blur-md text-white rounded-full border border-white/20 active:bg-white/40 shadow-lg">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                            </svg>
                        </button>
                        <button @click.stop="$emit('toggle-favorite')"
                            class="p-2 bg-white/20 backdrop-blur-md rounded-full border border-white/20 active:bg-white/40 shadow-lg transition-colors"
                            :class="favorite ? 'text-amber-300' : 'text-white'"
                            :title="favorite ? '取消收藏' : '收藏角色'" :aria-label="favorite ? '取消收藏' : '收藏角色'">
                            <svg class="w-4 h-4" :fill="favorite ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-star"></use></svg>
                        </button>
                        <button v-if="deck" @click.stop="$emit('delete-card')" title="删除角色" aria-label="删除角色"
                            class="p-2 bg-white/20 backdrop-blur-md text-white rounded-full border border-white/20 active:bg-white/40 shadow-lg">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-delete"></use></svg>
                        </button>
                    </div>

                    <div class="absolute bottom-0 left-0 right-0 p-3 z-10">
                        <h3 class="character-card-name text-white font-bold text-sm truncate mb-2 drop-shadow-md" :title="char.name">{{ char.name }}</h3>
                        <div v-if="!batchMode" class="flex items-center justify-between">
                            <div class="flex flex-wrap gap-1">
                                <span class="px-1.5 py-0.5 bg-white/20 backdrop-blur-md text-white text-[8px] rounded border border-white/10">{{ worldInfoCount }} 世界书</span>
                                <span class="px-1.5 py-0.5 bg-white/20 backdrop-blur-md text-white text-[8px] rounded border border-white/10">{{ regexCount }} 正则</span>
                            </div>
                        </div>
                    </div>
                </template>

                <template v-else>
                    <div class="aspect-w-2 aspect-h-3 relative h-[500px] overflow-hidden">
                        <img :src="char?.avatar" class="character-card-cover w-full h-full object-cover" loading="lazy" decoding="async">
                        <div class="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity"></div>

                        <div v-if="active && !batchMode" class="absolute top-4 left-4 z-10">
                            <div class="flex items-center text-xs font-bold text-white bg-green-600/60 backdrop-blur-xl px-3 py-1.5 rounded-full border border-white/30 shadow-[0_8px_20px_-4px_rgba(0,0,0,0.3)]">
                                <span class="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
                                当前使用
                            </div>
                        </div>

                        <div v-if="!batchMode" class="character-card-actions absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <button @click.stop="$emit('edit')" class="p-2 bg-white/90 backdrop-blur-sm text-gray-700 hover:text-primary-600 rounded-full shadow-lg transition-all hover:scale-110" title="编辑角色">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                </svg>
                            </button>
                            <button @click.stop="$emit('export-card')" class="p-2 bg-white/90 backdrop-blur-sm text-gray-700 hover:text-primary-600 rounded-full shadow-lg transition-all hover:scale-110" title="导出角色">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                                </svg>
                            </button>
                            <button @click.stop="$emit('toggle-favorite')" class="p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg transition-all hover:scale-110"
                                :class="favorite ? 'text-amber-500 hover:text-amber-600' : 'text-gray-700 hover:text-amber-500'"
                                :title="favorite ? '取消收藏' : '收藏角色'" :aria-label="favorite ? '取消收藏' : '收藏角色'">
                                <svg class="w-4 h-4" :fill="favorite ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-star"></use></svg>
                            </button>
                            <button @click.stop="$emit('delete-card')" class="p-2 bg-white/90 backdrop-blur-sm text-red-500 hover:text-red-700 rounded-full shadow-lg transition-all hover:scale-110" title="删除角色">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                </svg>
                            </button>
                        </div>

                        <div class="absolute bottom-0 left-0 p-4 w-full">
                            <h3 class="text-xl font-bold text-white mb-1 truncate drop-shadow-lg">{{ char.name }}</h3>
                            <div class="flex items-center gap-2">
                                <span class="px-2 py-0.5 bg-white/20 backdrop-blur-md text-white text-[10px] rounded-md border border-white/10">{{ worldInfoCount }} 世界书</span>
                                <span class="px-2 py-0.5 bg-white/20 backdrop-blur-md text-white text-[10px] rounded-md border border-white/10">{{ regexCount }} 正则</span>
                            </div>
                        </div>

                        <div v-if="batchMode" class="absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity"
                            :class="selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'">
                            <div class="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-2xl transform transition-transform"
                                :class="selected ? 'scale-100' : 'scale-75'">
                                <div class="w-12 h-12 rounded-full border-2 flex items-center justify-center"
                                    :class="selected ? 'bg-red-500 border-red-500' : 'border-gray-300'">
                                    <svg v-if="selected" class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
            </div>`
    };

    const CharacterDeck = {
        components: { CharacterCard },
        props: {
            items: { type: Array, required: true },
            visible: { type: Boolean, default: true },
            activeId: String,
            loadingIndex: { type: Number, default: null },
            worldInfoCount: { type: Function, required: true },
            regexCount: { type: Function, required: true }
        },
        emits: ['select', 'edit', 'export-card', 'toggle-favorite', 'delete-card'],
        setup(props, { expose }) {
            const focusedId = ref(props.activeId || '');
            const opening = ref(false);
            const importing = ref(false);
            const stageRef = ref(null);
            let importAnimation = null;
            const dragOffset = ref(0);
            const dragging = ref(false);
            let gesture = null;
            let suppressClickUntil = 0;
            const busy = computed(() => importing.value || (props.loadingIndex !== null && props.loadingIndex >= 0));
            const focusedIndex = computed(() => Math.max(0, props.items.findIndex(item => item.char.uuid === focusedId.value)));
            const focused = computed(() => props.items[focusedIndex.value]);
            const buttonColors = ref(null);
            watch(() => focused.value?.char.avatar, avatar => { if (!avatar) buttonColors.value = null; });
            // 读取失败（跨域封面）时抛错，由调用方决定退路。
            const readButtonColors = image => {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 12;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                context.drawImage(image, 0, 0, 12, 12);
                const pixels = context.getImageData(0, 0, 12, 12).data;
                const rgb = [0, 0, 0];
                let weight = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    const alpha = pixels[i + 3] / 255;
                    weight += alpha;
                    rgb.forEach((_, channel) => { rgb[channel] += pixels[i + channel] * alpha; });
                }
                if (!weight) return null;
                const color = rgb.map(value => Math.round(value / weight));
                const linear = color.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
                const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
                return { '--deck-button-bg': `rgb(${color.join(',')})`, '--deck-button-text': luminance > 0.45 ? '#000' : '#fff' };
            };
            const syncButtonColors = event => {
                const image = event.currentTarget;
                const src = image.getAttribute('src');
                if (src !== focused.value?.char.avatar) return;
                buttonColors.value = null;
                if (event.type === 'error') return;
                try {
                    buttonColors.value = readButtonColors(image);
                } catch {
                    // 工坊一键导入等跨域封面不能直接取色：允许跨域读取的图床再匿名读一次（通常直接命中缓存），
                    // 仍不允许时保留默认配色，不影响封面显示或切换。
                    const probe = new Image();
                    probe.crossOrigin = 'anonymous';
                    probe.onload = () => {
                        if (src !== focused.value?.char.avatar) return;
                        try { buttonColors.value = readButtonColors(probe); } catch { /* 图床不允许跨域读取 */ }
                    };
                    probe.src = src;
                }
            };
            watch(() => props.items.map(item => item.char.uuid), (ids, previous = []) => {
                if (ids.includes(focusedId.value)) return;
                const nextIndex = Math.max(0, Math.min(previous.indexOf(focusedId.value), ids.length - 1));
                focusedId.value = ids.includes(props.activeId) ? props.activeId : (ids[nextIndex] || '');
            }, { immediate: true });
            watch(() => props.activeId, id => {
                if (props.items.some(item => item.char.uuid === id)) focusedId.value = id;
            });
            // 最多渲染中间与左右各两张，收藏排序或筛选改变时仍跟随同一个角色。
            const visibleItems = computed(() => {
                const count = props.items.length;
                const result = [];
                const leftCount = Math.min(2, Math.floor((count - (dragOffset.value > 0 ? 0 : 1)) / 2));
                for (let offset = -leftCount; offset <= Math.min(2, count - leftCount - 1); offset++) {
                    if (!count) break;
                    const index = (focusedIndex.value + offset + count) % count;
                    const position = offset + dragOffset.value;
                    result.push({ ...props.items[index], offset, position, depth: Math.abs(position) });
                }
                return result;
            });
            const move = direction => {
                if (busy.value || props.items.length < 2) return;
                opening.value = false;
                const index = (focusedIndex.value + direction + props.items.length) % props.items.length;
                focusedId.value = props.items[index].char.uuid;
            };
            const focusCard = item => {
                if (busy.value) return;
                opening.value = false;
                focusedId.value = item.char.uuid;
            };
            const onKeydown = event => {
                if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.target.closest('input, textarea, select')) return;
                event.preventDefault();
                move(event.key === 'ArrowLeft' ? -1 : 1);
            };
            const beginDrag = event => {
                if (gesture || busy.value || props.items.length < 2 || !event.isPrimary
                    || (event.pointerType === 'mouse' && event.button !== 0)
                    || event.target.closest('button:not(.character-deck__peek)')) return;
                const stage = event.currentTarget;
                const cardWidth = stage.querySelector('.character-deck__item')?.offsetWidth || stage.clientWidth;
                const spread = parseFloat(getComputedStyle(stage).getPropertyValue('--deck-spread')) || 50;
                gesture = { id: event.pointerId, container: stage, x: event.clientX, y: event.clientY, time: event.timeStamp, step: Math.max(1, cardWidth * spread / 100) };
                // 和分支拖拽一样提前接住手势；侧卡按钮保留轻点切换。
                if (!event.target.closest('button')) stage.setPointerCapture(event.pointerId);
            };
            const resetDrag = () => {
                const state = gesture;
                gesture = null;
                dragOffset.value = 0;
                dragging.value = false;
                if (state?.container.hasPointerCapture(state.id)) state.container.releasePointerCapture(state.id);
            };
            const updateDrag = event => {
                if (!gesture || gesture.id !== event.pointerId) return;
                const dx = event.clientX - gesture.x;
                const dy = event.clientY - gesture.y;
                if (!dragging.value) {
                    if (Math.hypot(dx, dy) < 4) return;
                    if (Math.abs(dy) > Math.abs(dx) * 1.25 && Math.abs(dy) > 8) { resetDrag(); return; }
                    if (Math.abs(dx) < 4 || Math.abs(dx) < Math.abs(dy)) return;
                    opening.value = false;
                    dragging.value = true;
                    gesture.container.setPointerCapture(event.pointerId);
                }
                dragOffset.value = Math.max(-1, Math.min(1, dx / gesture.step));
                event.preventDefault();
            };
            const endDrag = event => {
                if (!gesture || gesture.id !== event.pointerId) return;
                if (event.type === 'pointerup') updateDrag(event);
                if (!gesture) return;
                const completed = event.type === 'pointerup' && dragging.value;
                const distance = event.clientX - gesture.x;
                const threshold = Math.max(20, Math.min(40, gesture.step * 0.25));
                const quickSwipe = Math.abs(distance) >= 12 && Math.abs(distance) / Math.max(1, event.timeStamp - gesture.time) >= 0.4;
                resetDrag();
                if (completed) {
                    suppressClickUntil = performance.now() + 250;
                    if (Math.abs(distance) >= threshold || quickSwipe) move(distance < 0 ? 1 : -1);
                }
            };
            const cancelImportAnimation = () => {
                importAnimation?.cancel();
                importAnimation = null;
                importing.value = false;
            };
            const revealImportedCard = async id => {
                if (!props.visible || !props.items.some(item => item.char.uuid === id)) return;
                resetDrag();
                cancelImportAnimation();
                opening.value = false;
                importing.value = true;
                focusedId.value = id;
                await nextTick();
                const card = stageRef.value?.querySelector('.character-deck__item.is-focused');
                if (!props.visible || !card?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    importing.value = false;
                    return;
                }
                let animation = null;
                try {
                    animation = card.animate([
                        { transform: 'translateX(-50%) translateY(-65%) scale(0.94)', opacity: 0 },
                        { transform: 'translateX(-50%) translateY(0) scale(1)', opacity: 1 }
                    ], { duration: 650, easing: 'cubic-bezier(0.22, 0.72, 0.18, 1)' });
                    importAnimation = animation;
                    await animation.finished;
                } catch {
                    // 离开页面或动画不受支持时，不阻断角色卡导入。
                } finally {
                    if (importAnimation === animation) cancelImportAnimation();
                }
            };
            expose({ revealImportedCard });
            watch(() => props.visible, visible => {
                opening.value = visible;
                if (!visible) { resetDrag(); cancelImportAnimation(); }
            }, { immediate: true });
            onBeforeUnmount(() => { resetDrag(); cancelImportAnimation(); });
            const guardClick = event => {
                if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
            };
            return { focused, visibleItems, busy, opening, importing, stageRef, dragging, buttonColors, syncButtonColors, move, focusCard, onKeydown, beginDrag, updateDrag, endDrag, guardClick };
        },
        template: `
            <section class="character-deck" role="region" aria-roledescription="轮播" aria-label="角色卡浏览"
                :class="{ 'character-deck--opening': opening }" tabindex="0" @keydown="onKeydown"
                @animationend="$event.animationName === 'character-deck-open' && (opening = false)">
                <div class="character-deck__backdrop" aria-hidden="true">
                    <transition name="character-backdrop">
                        <img v-if="focused?.char.avatar" :key="focused.char.uuid" :src="focused.char.avatar" alt="" decoding="async"
                            @load="syncButtonColors" @error="syncButtonColors">
                    </transition>
                </div>
                <div ref="stageRef" class="character-deck__stage" :class="{ 'is-dragging': dragging, 'is-importing': importing }" :inert="importing"
                    @pointerdown="beginDrag" @pointermove="updateDrag" @pointerup="endDrag"
                    @pointercancel="endDrag" @lostpointercapture="endDrag" @click.capture="guardClick" @dragstart.prevent>
                    <transition-group name="character-deck">
                        <article v-for="item in visibleItems" :key="item.char.uuid"
                            class="character-deck__item" :class="{ 'is-focused': item.depth < 0.5 }"
                            :style="{ '--deck-offset': item.position, '--deck-depth': item.depth, zIndex: 100 - Math.round(item.depth * 10) }">
                            <character-card :char="item.char" mobile deck :active="activeId === item.char.uuid"
                                :loading="loadingIndex === item.originalIndex" :favorite="Number(item.char.favoriteAt) > 0"
                                :world-info-count="worldInfoCount(item.char)" :regex-count="regexCount(item.char)"
                                :inert="item.offset !== 0" :aria-hidden="item.offset !== 0"
                                @edit="$emit('edit', item.originalIndex)" @export-card="$emit('export-card', item.originalIndex)"
                                @toggle-favorite="$emit('toggle-favorite', item.originalIndex)" @delete-card="$emit('delete-card', item.originalIndex)">
                            </character-card>
                            <button v-if="item.offset !== 0" class="character-deck__peek" :disabled="busy"
                                :aria-label="'浏览角色：' + item.char.name" @click="focusCard(item)"></button>
                        </article>
                    </transition-group>
                </div>
                <div v-if="focused" class="character-deck__navigation">
                    <button class="character-deck__arrow" aria-label="上一个角色" :disabled="items.length < 2 || busy" @click="move(-1)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <button class="character-deck__enter" :style="buttonColors" :disabled="busy" @click="$emit('select', focused.originalIndex)">
                        {{ loadingIndex === focused.originalIndex ? '正在切换…' : activeId === focused.char.uuid ? '继续对话' : '进入对话' }}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <button class="character-deck__arrow" aria-label="下一个角色" :disabled="items.length < 2 || busy" @click="move(1)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m10 6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                </div>
            </section>`
    };

    window.RPHubComponents = {
        ActionConfirmModal,
        ActiveToolEditorModal,
        AddCharacterModal,
        AutoImageGenModal,
        CharacterExportModal,
        CharacterEditorModal,
        CharacterCard,
        CharacterDeck,
        ContextViewerModal,
        EmbeddedViewContent,
        GenerationTimer,
        ExportSelectionModal,
        ModelSelectorModal,
        ModalHeader,
        ModalShell,
        PaginationControls,
        PresetEditorModal,
        RegexEditorModal,
        RetryConfirmModal,
        SettingsHelp,
        SettingsPageHeader,
        MemoryBackfillModal,
        MemoryCitationModal,
        StoryBranchModal,
        TokenUsageView,
        UiTemplatesView,
        UiTemplateEditorModal,
        UpdateNotificationModal,
        UserSetupModal,
        UiTemplatePending,
        WorldInfoEditorModal
    };
})();
