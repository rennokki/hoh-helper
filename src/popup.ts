import browser from "webextension-polyfill";
import {
    dataCollectionCategories,
    dataCollectionSettingsStorageKey,
    extensionHelpPage,
    fogHohApiBaseUrl,
    startupDataStorageKey,
    submissionIdStorageKey
} from "./constants";
import { DataCollectionSettings, ImportInGameStartupDataRequestDto, ResourceCreatedResponse } from "./types/types";
import getLogger from "./logger";

const exportDataButtonLabel = "Export Game Data";
const waitingForDataButtonLabel = "Waiting for data...";
const exportingDataButtonLabel = "Exporting...";
const logger = getLogger("popup");
document.addEventListener("DOMContentLoaded", async function() {
    const checkboxContainer = document.getElementById("checkboxContainer") as HTMLElement;
    const exportToFogButton = document.getElementById("exportToFogButton") as HTMLButtonElement;
    const enableAllButton = document.getElementById("enableAllButton") as HTMLButtonElement;

    function createCheckboxes(): void {
        dataCollectionCategories.forEach(category => {
            const item = document.createElement("div");
            item.className = "checkbox-item";

            const container = document.createElement("div");
            container.className = "checkbox-container";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = category.id;

            const label = document.createElement("label");
            label.className = "checkbox-label";
            label.htmlFor = category.id;
            label.textContent = category.label;

            const description = document.createElement("span");
            description.className = "checkbox-description";
            description.textContent = category.description;

            container.appendChild(checkbox);
            container.appendChild(label);
            item.appendChild(container);
            label.appendChild(description);
            checkboxContainer.appendChild(item);
        });
    }

    async function loadSettings(): Promise<void> {
        const result = await browser.storage.sync.get([dataCollectionSettingsStorageKey]);
        const settings: DataCollectionSettings = (result[dataCollectionSettingsStorageKey] || {}) as DataCollectionSettings;

        dataCollectionCategories.forEach(category => {
            const checkbox = document.getElementById(category.id) as HTMLInputElement;
            checkbox.checked = settings[category.id] || false;
        });
    }

    function attachCheckboxListeners(): void {
        dataCollectionCategories.forEach(category => {
            const checkbox = document.getElementById(category.id) as HTMLInputElement;
            if (checkbox) {
                checkbox.addEventListener("change", async function(e: Event) {
                    const target = e.target as HTMLInputElement;

                    const result = await browser.storage.sync.get([dataCollectionSettingsStorageKey]);
                    const settings: DataCollectionSettings = (result[dataCollectionSettingsStorageKey] || {}) as DataCollectionSettings;
                    settings[category.id] = target.checked;
                    await browser.storage.sync.set({ [dataCollectionSettingsStorageKey]: settings });
                });
            }
        });
    }

    async function updateExportDataState(): Promise<void> {
        if (await hasStartupData()) {
            enableExportButton();
        } else {
            exportToFogButton.disabled = true;
            exportToFogButton.textContent = waitingForDataButtonLabel;
        }
    }

    browser.storage.onChanged.addListener(async (_changes, area) => {
        if (area === "local") {
            if (await hasStartupData()) {
                enableExportButton();
            }
        }
    });

    exportToFogButton.addEventListener("click", async function() {
        exportToFogButton.disabled = true;
        exportToFogButton.textContent = exportingDataButtonLabel;

        const data = await getStartupData();
        if (data === null) {
            return;
        }
        try {
            logger.info("Exporting startup data");
            const payload: ImportInGameStartupDataRequestDto = {
                inGameStartupData: data
            };
            const apiResponse = await fetch(`${fogHohApiBaseUrl}/inGameData`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const response: ResourceCreatedResponse = await apiResponse.json();
            if (response.webResourceUrl) {
                await browser.tabs.create({ url: response.webResourceUrl });
                logger.info("Exported startup data");
            }
        } catch (error) {
            logger.error("Failed exporting startup data:", error);
        }
        enableExportButton();
    });

    async function hasStartupData(): Promise<boolean> {
        const startupData = await getStartupData();
        return startupData !== null;
    }

    async function getStartupData(): Promise<string | null> {
        const result = await browser.storage.local.get([startupDataStorageKey]);
        const v = result[startupDataStorageKey];
        return typeof v === "string" ? v : null;
    }

    function enableExportButton(): void {
        exportToFogButton.textContent = exportDataButtonLabel;
        exportToFogButton.disabled = false;
    }

    enableAllButton.addEventListener("click", async function() {
        dataCollectionCategories.forEach(category => {
            const checkbox = document.getElementById(category.id) as HTMLInputElement;
            checkbox.checked = true;
        });

        const newSettings: DataCollectionSettings = dataCollectionCategories.reduce((settings, category) => {
            settings[category.id] = true;
            return settings;
        }, {} as DataCollectionSettings);

        await browser.storage.sync.set({ [dataCollectionSettingsStorageKey]: newSettings });
    });

    document.getElementById("helpButton")?.addEventListener("click", async function() {
        await browser.tabs.create({ url: extensionHelpPage });
    });

    createCheckboxes();
    await loadSettings();
    attachCheckboxListeners();
    await updateExportDataState();

    const submissionIdLabel = document.getElementById("submissionIdLabel") as HTMLSpanElement;
    const submissionIdInput = document.getElementById("submissionIdInput") as HTMLInputElement;
    const editSubmissionIdButton = document.getElementById("editSubmissionIdButton") as HTMLButtonElement;
    const saveSubmissionIdButton = document.getElementById("saveSubmissionIdButton") as HTMLButtonElement;
    const generateSubmissionIdButton = document.getElementById("generateSubmissionIdButton") as HTMLButtonElement;
    const deleteSubmissionIdButton = document.getElementById("deleteSubmissionIdButton") as HTMLButtonElement;
    const copySubmissionIdButton = document.getElementById("copySubmissionIdButton") as HTMLButtonElement;
    const cancelSavingSubmissionIdButton = document.getElementById("cancelSavingSubmissionIdButton") as HTMLButtonElement;

    let currentSubmissionId = "";

    async function loadSubmissionId(): Promise<void> {
        const result = await browser.storage.sync.get(submissionIdStorageKey);
        const id = result[submissionIdStorageKey];
        currentSubmissionId = typeof id === "string" ? id : "";
        updateSubmissionIdDisplay();
    }

    function updateSubmissionIdDisplay(): void {
        submissionIdLabel.textContent = currentSubmissionId || "No ID set";
    }

    function isValidUUID(uuid: string): boolean {
        const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidV4Regex.test(uuid);
    }

    function setDefaultSubmissionFormElementsVisibility(): void {
        submissionIdLabel.classList.remove("hidden");
        generateSubmissionIdButton.classList.remove("hidden");
        submissionIdInput.classList.add("hidden");
        saveSubmissionIdButton.classList.add("hidden");
        cancelSavingSubmissionIdButton.classList.add("hidden");
        if (currentSubmissionId === undefined || currentSubmissionId === "") {
            editSubmissionIdButton.classList.add("hidden");
            deleteSubmissionIdButton.classList.add("hidden");
            copySubmissionIdButton.classList.add("hidden");
        } else {
            editSubmissionIdButton.classList.remove("hidden");
            deleteSubmissionIdButton.classList.remove("hidden");
            copySubmissionIdButton.classList.remove("hidden");
        }
    }

    editSubmissionIdButton.addEventListener("click", () => {
        submissionIdInput.value = currentSubmissionId;

        submissionIdInput.classList.remove("input-error");
        submissionIdLabel.classList.add("hidden");
        editSubmissionIdButton.classList.add("hidden");
        submissionIdInput.classList.remove("hidden");
        saveSubmissionIdButton.classList.remove("hidden");
        cancelSavingSubmissionIdButton.classList.remove("hidden");
        deleteSubmissionIdButton.classList.add("hidden");
        generateSubmissionIdButton.classList.add("hidden");
        copySubmissionIdButton.classList.add("hidden");
    });

    saveSubmissionIdButton.addEventListener("click", async () => {
        const newCode = submissionIdInput.value.trim();

        if (!isValidUUID(newCode)) {
            submissionIdInput.classList.add("input-error");
            submissionIdInput.title = "Invalid UUID format.";
            return;
        }

        submissionIdInput.classList.remove("input-error");
        submissionIdInput.title = "";

        currentSubmissionId = newCode;
        await browser.storage.sync.set({ [submissionIdStorageKey]: currentSubmissionId });
        updateSubmissionIdDisplay();

        setDefaultSubmissionFormElementsVisibility();
    });

    cancelSavingSubmissionIdButton.addEventListener("click", async () => {
        setDefaultSubmissionFormElementsVisibility();
    });

    generateSubmissionIdButton.addEventListener("click", async () => {
        currentSubmissionId = crypto.randomUUID();
        await browser.storage.sync.set({ [submissionIdStorageKey]: currentSubmissionId });
        updateSubmissionIdDisplay();
        deleteSubmissionIdButton.classList.remove("hidden");
        copySubmissionIdButton.classList.remove("hidden");
        editSubmissionIdButton.classList.remove("hidden");
    });

    deleteSubmissionIdButton.addEventListener("click", async () => {
        currentSubmissionId = "";
        await browser.storage.sync.remove(submissionIdStorageKey);
        updateSubmissionIdDisplay();
        deleteSubmissionIdButton.classList.add("hidden");
        copySubmissionIdButton.classList.add("hidden");
        editSubmissionIdButton.classList.add("hidden");
    });

    copySubmissionIdButton.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(submissionIdLabel.textContent || "");
            copySubmissionIdButton.title = "Copied!";
            setTimeout(() => {
                copySubmissionIdButton.title = "Copy";
            }, 1000);
        } catch (err) {
            console.error("Failed to copy", err);
        }
    });

    await loadSubmissionId();
    setDefaultSubmissionFormElementsVisibility();
});
