import { CategorizedDataCollectionEndpoint, DataCollectionCategory } from "./types/types";
import getLogger from "./logger";

export const dataCollectionCategories: DataCollectionCategory[] = [
    {
        id: "leaderboards",
        label: "Leaderboards",
        description: "Player, alliance, arena and ATH leaderboards",
        gameEndpoint: [
            "game/ranking/player",
            "game/ranking/alliance",
            "game/wakeup"
        ]
    },
    {
        id: "alliance",
        label: "Your Alliance",
        description: "Your alliance members and ATH internal rankings",
        gameEndpoint: [
            "game/wakeup"
        ]
    },
    {
        id: "pvpBattles",
        label: "Arena Battles",
        description: "Your arena battles",
        gameEndpoint: [
            "game/pvp/get-battle-history"
        ]
    },
    {
        id: "battleStats",
        label: "Battle stats",
        description: "Result stats of battles",
        gameEndpoint: [
            "game/battle/hero/stats"
        ]
    },
    {
        id: "battles",
        label: "Battles",
        description: "Anonymous battle logging",
        gameEndpoint: [
            "game/battle/hero/start",
            "game/battle/hero/complete-wave"
        ]
    },
    {
        id: "woa",
        label: "Atlantis",
        description: "Leaderboards, map, opponents etc",
        gameEndpoint: [
            "game/wakeup",
            "game/woa/get-player-statistics"
        ]
    }
];

export const defaultSendingFrequencyMinutes: number = 360;
export const sendingFrequenciesMinutes: Record<string, number> = {
    "game/battle/hero/stats": 0.017,
    "game/battle/hero/start": 0.017,
    "game/battle/hero/complete-wave": 0.017,
    "game/pvp/get-battle-history": 60,
    "game/wakeup": 180,
    "game/woa/get-player-statistics": 30,
};

export const messagingPageSource: string = "hohPage";
export const hohProxyDataReceived: string = "hohProxyDataReceived";
export const endpointMap: Record<string, string[]>= {};

export const dataCollectionApiBaseUrl = DATA_COLLECTION_API_BASE_URL;
export const fogHohApiBaseUrl = FOG_HOH_API_BASE_URL;
export const extensionHelpPage = EXTENSION_HELP_PAGE;

export const submissionIdStorageKey = "submissionId";
export const dataCollectionSettingsStorageKey: string = "dataCollectionSettings";
export const dataCollectionTimingsStorageKey: string = "dataCollectionTimings";
export const startupDataStorageKey: string = "startupData";
export const gameStartupUrlPattern: string = "game/startup";

export const getPathFromUrl = function(url: string): string {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.pathname.replace(/^\/+|\/+$/g, "");
    } catch (error) {
        logger.error("Invalid URL:", error);
        return "";
    }
};

export const toBase64 = (src: unknown): string | null => {
    if (!(src instanceof ArrayBuffer || src instanceof Uint8Array)) {
        logger.warn("Invalid input type for toBase64. Expected ArrayBuffer or Uint8Array.");
        return null;
    }
    const bytes = src instanceof ArrayBuffer ? new Uint8Array(src) : src;

    try {
        const chunkSize = 8192;
        let binary = "";
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.slice(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
        }
        return btoa(binary);
    } catch (err) {
        logger.error("Failed to convert to base64", err);
        return null;
    }
};

export function getIdsByUrlPattern(urlPattern: string): string[] {
    return endpointMap[urlPattern] || [];
}

const logger = getLogger("constants");

dataCollectionCategories.forEach(category => {
    category.gameEndpoint.forEach(endpoint => {
        if (!endpointMap[endpoint]) {
            endpointMap[endpoint] = [];
        }
        endpointMap[endpoint].push(category.id);
    });
});
