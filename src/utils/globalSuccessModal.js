const SUCCESS_EVENT_NAME = "global-api-success";

export const emitGlobalSuccessModal = ({ message, status } = {}) => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
        new CustomEvent(SUCCESS_EVENT_NAME, {
            detail: {
                message,
                status,
            },
        })
    );
};

export const subscribeToGlobalSuccessModal = (handler) => {
    if (typeof window === "undefined") return () => {};

    const listener = (event) => {
        handler(event.detail || {});
    };

    window.addEventListener(SUCCESS_EVENT_NAME, listener);
    return () => window.removeEventListener(SUCCESS_EVENT_NAME, listener);
};
