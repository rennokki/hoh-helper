import browser from "webextension-polyfill";
import {
    DataCollectionSettings,
    DataCollectionTimings,
    HohHelperResponseDto,
    WebPageMessagePayload
} from "./types/types";
import {
    dataCollectionApiBaseUrl,
    dataCollectionSettingsStorageKey,
    dataCollectionTimingsStorageKey,
    defaultSendingFrequencyMinutes,
    endpointMap,
    gameStartupUrlPattern,
    getPathFromUrl,
    hohProxyDataReceived,
    messagingPageSource,
    sendingFrequenciesMinutes,
    startupDataStorageKey,
    submissionIdStorageKey
} from "./constants";
import getLogger from "./logger";

const logger = getLogger("content");

window.addEventListener("message", async (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data as WebPageMessagePayload;

    if (data == null) return;

    if (data.source !== messagingPageSource) {
        logger.debug(`Skipped unknown source ${data.source}`);
        return;
    }

    logger.debug(`Received ${data.event}`);

    switch (data.event) {
        case hohProxyDataReceived: {
            await handleProxyData(data);
            break;
        }
        default: {
            logger.debug(`Unhandled event: ${data.event}`);
            break;
        }
    }
});

const handleProxyData = async function(data: WebPageMessagePayload) {
    logger.debug(`Received ${data.responseURL}`);
    const responseUrlPath = getPathFromUrl(data.responseURL);
    if (responseUrlPath === gameStartupUrlPattern) {
        await saveStartupData(data.base64ResponseData);
    }
    if (!endpointMap[responseUrlPath]) {
        return;
    }
    logger.debug(`Pattern matched ${responseUrlPath}`);
    const categoryIds = endpointMap[responseUrlPath];
    const allowedCategoryIds: string[] = [];
    for (const categoryId of categoryIds) {
        if (await canSend(categoryId, responseUrlPath)) {
            allowedCategoryIds.push(categoryId);
        }
    }

    if (allowedCategoryIds.length > 0) {
        logger.info(`Sending '${responseUrlPath}'`);
        const payload: HohHelperResponseDto = {
            base64RequestData: data.base64RequestData,
            base64ResponseData: data.base64ResponseData,
            responseURL: data.responseURL,
            collectionCategoryIds: allowedCategoryIds,
            submissionId: await getSubmissionId()
        };
        await sendData(payload);
        await saveSentTiming(responseUrlPath);
    } else {
        logger.info(`Sending of '${responseUrlPath}' is not allowed.`);
    }
};

const getConsent = async (categoryId: string): Promise<boolean> => {
    const result = await browser.storage.sync.get(dataCollectionSettingsStorageKey);
    if (result == null) {
        return false;
    }
    const settings: DataCollectionSettings = (result[dataCollectionSettingsStorageKey] || {}) as DataCollectionSettings;
    return Boolean(settings[categoryId]);
};

const getLastSentTime = async (gameEndpoint: string): Promise<Date> => {
    const result = await browser.storage.sync.get(dataCollectionTimingsStorageKey);
    if (result == null) {
        return new Date(0);
    }
    const timings: DataCollectionTimings = (result[dataCollectionTimingsStorageKey] || {}) as DataCollectionTimings;
    if (timings[gameEndpoint]) {
        return new Date(timings[gameEndpoint]);
    }
    return new Date(0);
};

const canSend = async (categoryId: string, gameEndpoint: string): Promise<boolean> => {
    try {
        const allowed = await getConsent(categoryId);
        logger.info(`Consent check for category '${categoryId}' on endpoint '${gameEndpoint}': ${allowed}`);
        logger.debug(`getConsent(${categoryId}) returned ${allowed}`);

        if (!allowed) {
            logger.info(`Sending not allowed for category '${categoryId}' on endpoint '${gameEndpoint}'. Aborting.`);
            return false;
        }

        const lastSentTime = await getLastSentTime(gameEndpoint);
        const now = new Date();
        const elapsedFromLastSend = now.getTime() - lastSentTime.getTime();
        logger.debug(`Time now: ${now.toISOString()}, last sent: ${lastSentTime.toISOString()}, elapsed: ${elapsedFromLastSend} ms`);

        const sendingFrequency = sendingFrequenciesMinutes[gameEndpoint] || defaultSendingFrequencyMinutes;
        const sendingFrequencyMs = sendingFrequency * 60 * 1000;
        if (elapsedFromLastSend < sendingFrequencyMs) {
            logger.info(`Skipping send for category '${categoryId}' on endpoint '${gameEndpoint}' (elapsed ${elapsedFromLastSend} ms is less than required ${sendingFrequencyMs} ms)`);
            return false;
        }

        logger.info(`Sending allowed for category '${categoryId}' on endpoint '${gameEndpoint}'`);
        return true;
    } catch (error) {
        logger.error(`Error in canSend for category '${categoryId}' on endpoint '${gameEndpoint}': ${error}`);
        return false;
    }
};

const sendData = async (payload: HohHelperResponseDto): Promise<void> => {
    logger.info("Sending...");
    try {
        await fetch(dataCollectionApiBaseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        logger.info("Sent");
    } catch (err) {
        logger.error("Failed to send", err);
    }
};

const saveSentTiming = async (gameEndpoint: string): Promise<void> => {
    const result = await browser.storage.sync.get(dataCollectionTimingsStorageKey);
    const timings: DataCollectionTimings = (result[dataCollectionTimingsStorageKey] || {}) as DataCollectionTimings;
    timings[gameEndpoint] = new Date().toISOString();
    await browser.storage.sync.set({ [dataCollectionTimingsStorageKey]: timings });
};

const saveStartupData = async (data: string): Promise<void> => {
    await browser.storage.local.set({ [startupDataStorageKey]: data });
};

const getSubmissionId = async (): Promise<string | undefined> => {
    const result = await browser.storage.sync.get(submissionIdStorageKey);
    const id = result[submissionIdStorageKey];
    return typeof id === "string" ? id : undefined;
};
