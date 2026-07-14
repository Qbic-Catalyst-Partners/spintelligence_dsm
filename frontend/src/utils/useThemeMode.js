import { useCallback, useEffect, useState } from "react";

const THEME_STORAGE_KEY = "spintelligence-theme";

const applyTheme = (theme) => {
    if (typeof document === "undefined") {
        return;
    }

    document.documentElement.dataset.theme = theme;
};

export function useThemeMode() {
    const [theme, setTheme] = useState("light");

    useEffect(() => {
        const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        const initialTheme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : "light";

        setTheme(initialTheme);
        applyTheme(initialTheme);
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme((currentTheme) => {
            const nextTheme = currentTheme === "dark" ? "light" : "dark";
            window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
            applyTheme(nextTheme);
            return nextTheme;
        });
    }, []);

    return {
        isDarkMode: theme === "dark",
        theme,
        toggleTheme,
    };
}
