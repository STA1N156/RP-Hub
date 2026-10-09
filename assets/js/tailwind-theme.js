// Shared Tailwind theme for RP Hub, the character workshop and the novel editor.
// Palette steps read CSS variables from theme.css, so dark mode only swaps variables
// instead of overriding individual utility classes.
(function () {
    const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
    const rgb = name => `rgb(var(--${name}) / <alpha-value>)`;
    // Optional role variables (e.g. --primary-text-600) fall back to the base step.
    const scale = (name, role) => Object.fromEntries(steps.map(step => [step, role
        ? `rgb(var(--${name}-${role}-${step}, var(--${name}-${step})) / <alpha-value>)`
        : rgb(`${name}-${step}`)]));

    const colors = {
        gray: scale('gray'),
        stone: scale('stone'),
        primary: scale('primary'),
        blue: scale('primary'),
        red: scale('red'),
        green: scale('green'),
        emerald: scale('green'),
        yellow: scale('amber'),
        amber: scale('amber'),
        orange: scale('amber')
    };
    // Text and dark fills need their own steps in dark mode: light text on dark surfaces,
    // and 700-900 fills that stay dark behind white text.
    const textColor = {
        gray: scale('gray'),
        primary: scale('primary', 'text'),
        blue: scale('primary', 'text'),
        red: scale('red', 'text'),
        green: scale('green', 'text'),
        emerald: scale('green', 'text'),
        yellow: scale('amber', 'text'),
        amber: scale('amber', 'text'),
        orange: scale('amber', 'text')
    };

    tailwind.config = {
        theme: {
            extend: {
                // Stacks live in theme.css so CSS and utilities share one definition.
                fontFamily: { sans: 'var(--font-sans)', serif: 'var(--font-serif)', mono: 'var(--font-mono)' },
                colors,
                textColor,
                backgroundColor: { white: rgb('surface'), gray: scale('gray', 'fill'), stone: scale('stone', 'fill') },
                gradientColorStops: { white: rgb('surface'), gray: scale('gray', 'fill'), stone: scale('stone', 'fill') },
                borderColor: { white: rgb('surface-edge') },
                ringColor: { white: rgb('surface-edge') },
                ringOffsetColor: { DEFAULT: 'rgb(var(--gray-50))' },
                animation: {
                    'fade-in': 'fade-in var(--dur-2) var(--ease-out) both',
                    'slide-up': 'rise-in var(--dur-3) var(--ease-out) both'
                },
                transitionTimingFunction: {
                    'modal-fade': 'var(--ease-out)',
                    spring: 'var(--ease-spring)'
                },
                boxShadow: {
                    card: 'var(--shadow-1)',
                    soft: 'var(--shadow-1)'
                }
            }
        }
    };
})();
