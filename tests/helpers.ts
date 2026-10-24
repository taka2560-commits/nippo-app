// テスト用に、ブラウザの window / localStorage の代わりになるものを用意する
export function installBrowserGlobals() {
    const store = new Map<string, string>();
    const localStorage = {
        getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
    };
    Object.assign(globalThis, { window: globalThis, localStorage });
    return localStorage;
}
