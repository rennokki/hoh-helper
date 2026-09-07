import HohProxy from "./hohProxy";
import { HohProxyData, WebPageMessagePayload } from "../types/types";
import {
    endpointMap,
    gameStartupUrlPattern,
    getPathFromUrl,
    hohProxyDataReceived,
    messagingPageSource,
    toBase64
} from "../constants";
import getLogger from "../logger";

class InGameDataHandler {
    static logger = getLogger("main");

    static init(): void {
        HohProxy.addRawHandler(InGameDataHandler.handleHohProxyData, InGameDataHandler.isTrackedUrl);
    }

    private static isTrackedPath(responseUrlPath: string): boolean {
        return Boolean(endpointMap[responseUrlPath]) || responseUrlPath === gameStartupUrlPattern;
    }

    private static isTrackedUrl(url: string): boolean {
        return InGameDataHandler.isTrackedPath(getPathFromUrl(url));
    }

    private static handleHohProxyData(data: HohProxyData): void {
        InGameDataHandler.logger.debug(`Received ${data.responseURL}`);
        const responseUrlPath = getPathFromUrl(data.responseURL);
        if (!InGameDataHandler.isTrackedPath(responseUrlPath)) {
            return;
        }
        InGameDataHandler.logger.debug(`Pattern matched ${responseUrlPath}`);
        // We need this convertion early because of window.postMessage
        // serialization penalty when sending raw request's TypedArray payload.
        // It seems that either the TypedArray's buffer gets serialized in whole
        // or at minimum it degrades the performance significantly.
        const payload = InGameDataHandler.convert(data);
        if (payload !== null) {
            InGameDataHandler.logger.debug(`Sending message to the extension ${responseUrlPath}`);
            window.postMessage(payload, "*");
        }
    }

    private static convert(payload: HohProxyData): WebPageMessagePayload | null {
        let base64RequestData: string | null = null;
        if (payload.request.postData !== undefined && payload.request.postData !== null) {
            base64RequestData = toBase64(payload.request.postData);
            if (!base64RequestData) {
                InGameDataHandler.logger.warn(`Could not convert request data to base64 for ${payload.request.url}`);
                return null;
            }
        }

        const base64ResponseData = payload.response ? toBase64(payload.response) : null;
        if (!base64ResponseData) {
            InGameDataHandler.logger.warn(`Could not convert response data to base64 for ${payload.request.url}`);
            return null;
        }

        return {
            source: messagingPageSource,
            event: hohProxyDataReceived,
            responseURL: payload.responseURL,
            base64RequestData: base64RequestData!,
            base64ResponseData: base64ResponseData
        };
    }
}

document.addEventListener("DOMContentLoaded", InGameDataHandler.init);