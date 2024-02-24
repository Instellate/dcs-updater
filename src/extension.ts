import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { createWriteStream, createReadStream, stat } from 'fs';
import { extname, parse } from 'path';
import debounce from 'lodash.debounce';
import JSZip from 'jszip';

interface Config {
	filePath: string | undefined,
	updateDelay: number
}

const statusBar = vscode.window.createStatusBarItem(
	"dcs-updater.zipFileStatus",
	vscode.StatusBarAlignment.Right
);

async function textDocumentSaved(textDocument: vscode.TextDocument) {
	const path = parse(textDocument.fileName);
	const config: Config | undefined = vscode.workspace
		.getConfiguration()
		.get("dcsUpdater");
	if (!config || !config.filePath) {
		return;
	}

	if (path.ext !== ".lua") {
		return;
	}
	statusBar.text = "$(loading~spin) Updating .miz file";

	let zip: JSZip;
	try {
		const data = await fs.readFile(config.filePath);
		zip = await JSZip.loadAsync(data);
	} catch (err) {
		console.log(err);
		vscode.window.showErrorMessage("Couldn't load .miz file");
		return;
	}

	zip.file(path.base, textDocument.getText());
	await Promise.resolve(zip.generateNodeStream({ type: "nodebuffer", streamFiles: true })
		.pipe(createWriteStream(config.filePath)));

	statusBar.text = "$(pass-filled) .miz file updated";
}

async function updateMissionFilePath() {
	const inputBoxOption: vscode.InputBoxOptions = {
		title: "Mission file path....",
	};

	const path = await vscode.window.showInputBox(inputBoxOption);
	if (!path) {
		vscode.window.showErrorMessage("DCS Updater: You need to enter a path");
		return;
	}

	try {
		await fs.access(path, fs.constants.W_OK | fs.constants.R_OK);
	} catch (err: unknown) {
		vscode.window.showErrorMessage(
			"DCS Updater: File does not exist or cannot be accessed"
		);
		return;
	}

	const lstat = await fs.lstat(path);
	if (!lstat.isFile) {
		vscode.window.showErrorMessage("DCS Updater: Path does not lead to file");
		return;
	}

	if (extname(path) !== ".miz") {
		vscode.window.showErrorMessage("DCS Updater: File is not a mission file");
		return;
	}

	const workspaceConfig = vscode.workspace.getConfiguration();
	let config: Config | undefined = workspaceConfig.get("dcsUpdater");
	if (!config) {
		config = {
			filePath: path,
			updateDelay: 5
		};
	} else {
		config.filePath = path;
	}
	await workspaceConfig.update("dcsUpdater", config);
}

export function activate(context: vscode.ExtensionContext) {
	const updateCmd = vscode.commands.registerCommand(
		"dcs-updater.missionFile",
		updateMissionFilePath
	);

	const debouncer = debounce(
		textDocumentSaved,
		(vscode.workspace.getConfiguration().get("dcsUpdater") as Config).updateDelay);

	const documentChangedEvent =
		vscode.workspace.onDidSaveTextDocument(debouncer);

	if ((vscode.workspace.getConfiguration().get("dcsUpdater") as Config | undefined)?.filePath) {
		statusBar.show();
		statusBar.text = "$(pass-filled) .miz file updated";
		statusBar.tooltip = "DCS Updater status";
	} else {
		statusBar.hide();
	}

	context.subscriptions.push(updateCmd);
	context.subscriptions.push(documentChangedEvent);
	context.subscriptions.push(statusBar);
}

export function deactivate() { }
