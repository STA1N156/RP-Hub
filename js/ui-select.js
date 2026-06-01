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
                                'overflow-y-auto rounded-xl border border-gray-200 bg-white/95 p-1.5 shadow-2xl shadow-gray-900/15 backdrop-blur-xl custom-scrollbar',
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
