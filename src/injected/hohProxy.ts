/*
 * **************************************************************************************
 * Original work Copyright (C) 2024 FoE-Helper team
 * Modified work Copyright (C) 2024 Forge of Games team
 *
 * You may use, distribute and modify this code under the
 * terms of the AGPL license.
 *
 * Original source: https://github.com/mainIine/foe-helfer-extension/
 * Modified source: https://github.com/IngweLand/hoh-helper/
 *
 * This file is a modified version of the original FoE-Helper extension
 * Modified for the needs of Forge of Games
 * **************************************************************************************
 */

import { HohProxyData, HohRequestData } from "../types/types";
import getLogger from "../logger";

const HohProxy = (() => {
    const logger = getLogger("proxy");
    const requestInfoHolder = new WeakMap<XMLHttpRequest, HohRequestData>();

    function getRequestData(xhr: XMLHttpRequest): HohRequestData {
        let data = requestInfoHolder.get(xhr);
        if (data) return data;

        data = { url: "", method: "", postData: null };
        requestInfoHolder.set(xhr, data);
        return data;
    }

    type RawHandler = {
        callback: (data: HohProxyData) => void;
        shouldCapture?: (url: string) => boolean;
    };

    // Handler maps
    const proxyRaw: RawHandler[] = [];

    function emit(data: HohProxyData): void {
        for (const handler of proxyRaw) {
            try {
                handler.callback(data);
            } catch (e) {
                logger.error("Error in raw handler:", e);
            }
        }
    }

    function isCaptured(url: string): boolean {
        return proxyRaw.some(handler => !handler.shouldCapture || handler.shouldCapture(url));
    }

    // Capture original XHR methods
    const XHR = XMLHttpRequest.prototype;
    const originalOpen = XHR.open;
    const originalSend = XHR.send;

    // Override open method
    XHR.open = function(
        this: XMLHttpRequest,
        method: string,
        url: string | URL,
        async: boolean = true,
        username?: string | null,
        password?: string | null
    ): void {
        const data = getRequestData(this);
        data.method = method;
        data.url = url;
        return originalOpen.apply(this, [method, url, async, username, password]);
    };

    // Override send method
    XHR.send = function(postData?: Document | XMLHttpRequestBodyInit | null): void {
        const data = getRequestData(this);
        data.postData = postData;
        this.addEventListener("load", xhrOnLoadHandler, {
            capture: false,
            passive: true
        });
        return originalSend.apply(this, [postData]);
    };

    function xhrOnLoadHandler(this: XMLHttpRequest): void {
        emit({
            request: getRequestData(this),
            response: this.response,
            responseURL: this.responseURL
        });
    }

    // The game switched from XMLHttpRequest to fetch on some servers, so both
    // transports have to be proxied.
    const textEncoder = new TextEncoder();
    const originalFetch = window.fetch;

    function resolveUrl(input: RequestInfo | URL): string {
        let raw: string;
        if (typeof input === "string") {
            raw = input;
        } else if (input instanceof URL) {
            raw = input.href;
        } else if (input && typeof (input as Request).url === "string") {
            raw = (input as Request).url;
        } else {
            raw = String(input);
        }

        try {
            return new URL(raw, document.baseURI).href;
        } catch {
            return raw;
        }
    }

    function encodeText(value: string): ArrayBuffer {
        return textEncoder.encode(value).buffer as ArrayBuffer;
    }

    function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
        if (init && typeof init.method === "string") return init.method;
        if (input instanceof Request) return input.method;
        return "GET";
    }

    async function toArrayBuffer(body: BodyInit | null | undefined): Promise<ArrayBuffer | null> {
        if (body === null || body === undefined) return null;
        if (body instanceof ArrayBuffer) return body;
        if (ArrayBuffer.isView(body)) {
            return new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice().buffer;
        }
        if (typeof body === "string") return encodeText(body);
        if (body instanceof URLSearchParams) return encodeText(body.toString());
        if (body instanceof Blob) return await body.arrayBuffer();

        logger.warn("Unsupported fetch request body; capturing without request data.");
        return null;
    }

    async function getRequestBody(
        init: RequestInit | undefined,
        requestClone: Request | null
    ): Promise<ArrayBuffer | null> {
        if (init && "body" in init) {
            return await toArrayBuffer(init.body);
        }
        if (requestClone) {
            return await requestClone.arrayBuffer();
        }
        return null;
    }

    async function captureFetch(
        input: RequestInfo | URL,
        init: RequestInit | undefined,
        requestClone: Request | null,
        responseClone: Response,
        responseURL: string
    ): Promise<void> {
        const postData = await getRequestBody(init, requestClone);
        emit({
            request: {
                url: responseURL,
                method: getRequestMethod(input, init),
                postData
            },
            response: await responseClone.arrayBuffer(),
            responseURL
        });
    }

    window.fetch = function(
        this: unknown,
        input: RequestInfo | URL,
        init?: RequestInit
    ): Promise<Response> {
        let requestUrl = "";
        let requestClone: Request | null = null;
        try {
            requestUrl = resolveUrl(input);
            if (isCaptured(requestUrl) && input instanceof Request && input.body !== null && !input.bodyUsed) {
                requestClone = input.clone();
            }
        } catch (e) {
            logger.error("Error in fetch proxy:", e);
        }

        const responsePromise = originalFetch.apply(this ?? window, [input, init]);
        return responsePromise.then(response => {
            try {
                const responseURL = response.url || requestUrl;
                if (isCaptured(responseURL)) {
                    captureFetch(input, init, requestClone, response.clone(), responseURL).catch(e => {
                        logger.error("Error while capturing fetch:", e);
                    });
                }
            } catch (e) {
                logger.error("Error in fetch proxy:", e);
            }
            return response;
        });
    };

    return {
        addRawHandler: (
            callback: (data: HohProxyData) => void,
            shouldCapture?: (url: string) => boolean
        ): void => {
            if (!proxyRaw.some(handler => handler.callback === callback)) {
                proxyRaw.push({ callback, shouldCapture });
            }
        },

        // Remove raw handler
        removeRawHandler: (callback: (data: HohProxyData) => void): void => {
            const index = proxyRaw.findIndex(handler => handler.callback === callback);
            if (index !== -1) {
                proxyRaw.splice(index, 1);
            }
        }
    };
})();

export default HohProxy;
