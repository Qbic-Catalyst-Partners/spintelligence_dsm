const FAILURE_EVENT_NAME = "global-api-failure";

export const emitGlobalFailureModal = ({ message, status } = {}) => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
        new CustomEvent(FAILURE_EVENT_NAME, {
            detail: {
                message,
                status,
            },
        })
    );
};

export const subscribeToGlobalFailureModal = (handler) => {
    if (typeof window === "undefined") return () => {};

    const listener = (event) => {
        handler(event.detail || {});
    };

    window.addEventListener(FAILURE_EVENT_NAME, listener);
    return () => window.removeEventListener(FAILURE_EVENT_NAME, listener);
};

