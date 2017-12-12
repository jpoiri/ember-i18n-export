#!/usr/bin/env node
'use strict';

let program = require('commander');
let fs = require('fs');
let flatten = require('flat');
let csvWriter = require('csv-write-stream');
let csvParser = require('csv-parser');
let wordCount = require('wordcount');
let arrayContains = require('array-contains');
let arrayDiff = require('array-difference');
let forEachKeys = require('object-loops/for-each');
let chalk = require('chalk');
let timestamp = require('time-stamp');

const ENCODING = 'UTF-8';
const BINARY_ENCODING = 'binary';

const UpdateType = {
	UPDATE: 'UPDATE',
	INSERT: 'NEW',
	DELETE: 'DELETE'
};

let opts = {
	inputDir: 'app/locales/',
	inputFile: 'translations.js',
	outputDir: 'i18n-exports',
	outputFile: 'translations.csv',
	journalFile: `translations-updates-${timestamp('YYYYMMDDHHmmss')}.csv`,
	metaDataFile: 'translations-meta.csv',
	localeColumnNames: {},
	translationKeyColumnName: 'SYSTEM_KEY',
	showDeletedInJournal: false,
	showOldValueInJournal: false
};

program
	.version('1.1.1')
	.option('--inputDir [inputDir]', 'The input directory for locales. Defaults to app/locales')
	.option('--inputFile [inputFile]', 'The input translation file for locales. Defaults to translations.js')
	.option('--outputFile [outputFile]', 'The output csv file. Defaults to translations.cvs')
	.option('--outputDir [outputDir]', 'The output directory. Defaults to i18n-exports')
	.option('--metaDataFile [metaDataFile]', 'The csv file containing the meta information about each locale. Defaults to translations-meta.csv')
	.option('--journalFile [journalFile]', 'The csv file containing journal information. Defaults to translations-updates-${timestamp}.csv')
	.option('--showDeletedInJournal', 'Show/hide deleted translations from journal file. Defaults to false')
	.option('--showOldValueInJournal', 'Show/hide old translation value from journal file. Defaults to false')
	.option('--translationKeyColumnName [translationKeyColumnName]',
		'The column name for the translation key. Defaults to SYSTEM_KEY')
	.option('--localeColumnNames [localeColumnNames]', 'The column names for each locales. Use the locale name as the key. ' +
		'Defaults to {\\\"en\\\:\\\"EN\\\",\\\"fr\\\": \\\"FR\\\"}')
	.parse(process.argv);

if (program.inputDir) {
	opts.inputDir = program.inputDir;
}
if (program.inputFile) {
	opts.inputFile = program.inputFile;
}
if (program.outputFile) {
	opts.outputFile = program.outputFile;
}
if (program.metaDataFile) {
	opts.metaDataFile = program.metaDataFile;
}
if (program.journalFile) {
	opts.journalFile = program.journalFile;
}
if (program.showDeletedInJournal) {
	opts.showDeletedInJournal = true;
}
if (program.showOldValueInJournal) {
	opts.showOldValueInJournal = true;
}
if (program.outputDir) {
	opts.outputDir = program.outputDir;
}
if (program.localeColumnNames) {
	opts.localeColumnNames = JSON.parse(program.localeColumnNames);
}
if (program.translationKeyColumnName) {
	opts.translationKeyColumnName = program.translationKeyColumnName.toUpperCase();
}

exportTranslations(opts);

/**
 * Main function
 * @param opts The options
 */
function exportTranslations(opts) {

	logOptions(opts);

	// get translation map.
	let translationMap = getTranslationMap(opts.inputDir, opts.inputFile);

	// get translation keys.
	let translationKeys = getTranslationKeys(translationMap);

	cleanDirectory(opts.outputDir);

	let outputFilePath = `${opts.outputDir}/${opts.outputFile}`;

	if (fs.existsSync(outputFilePath)) {
		let oldTranslationMap = {};
		fs.createReadStream(outputFilePath, {
			encoding: BINARY_ENCODING
		}).pipe(csvParser())
			.on('headers', (headers) => {
				let hasTranslationKey = false;

				headers.forEach((header) => {
					if (header !== opts.translationKeyColumnName) {
						// if locale map not created it.
						if (!oldTranslationMap[getLocaleFromColumnName(header, opts.localeColumnNames)]) {
							oldTranslationMap[getLocaleFromColumnName(header, opts.localeColumnNames)] = {};
						}
					} else {
						hasTranslationKey = true;
					}
				});

				if (!hasTranslationKey) {
					throw new Error(chalk.red('There is no translation key column defined.'));
				}
			})
			.on('data', (data) => {
				forEachKeys(oldTranslationMap, (localeObj, localKey) => {
					if (data[opts.translationKeyColumnName]) {
						oldTranslationMap[localKey][data[opts.translationKeyColumnName]] =
							data[getColumnNameFromLocale(localKey, opts.localeColumnNames)]
					}
				});
			})
			.on('end', () => {

				// generate the translation file.
				generateTranslationFile(opts.outputDir, opts.outputFile, translationMap, translationKeys,
					opts.translationKeyColumnName, opts.localeColumnNames);

				// get translations keys inserted since last export.
				const insertedTranslationKeys = getInsertedTranslationKeys(oldTranslationMap, translationMap);

				// get translations keys updated since last export.
				const updatedTranslationKeys = getUpdatedTranslationKeys(oldTranslationMap, translationMap);

				// get translation keys deleted since last export.
				const deletedTranslationKeys = getDeletedTranslationKeys(oldTranslationMap, translationMap);

				// check if journal is generated
				if (isJournalGenerated(insertedTranslationKeys, updatedTranslationKeys,
						deletedTranslationKeys, opts.showDeletedInJournal)) {

					logWarning('Translations was updated since last export, generating the report');

					generateJournalFile(opts.outputDir, opts.journalFile, translationMap, oldTranslationMap,
						insertedTranslationKeys, updatedTranslationKeys, deletedTranslationKeys,
						opts.translationKeyColumnName, opts.localeColumnNames,
						opts.showDeletedInJournal, opts.showOldValueInJournal);
				}

				// generate the translation meta file.
				generateTranslationMetaFile(opts.outputDir, opts.metaDataFile, translationMap);

				logSuccess('Successfully exported translations.');
			});

	} else {

		// generate the translation file.
		generateTranslationFile(opts.outputDir, opts.outputFile, translationMap, translationKeys,
			opts.translationKeyColumnName, opts.localeColumnNames);

		// generate the translation meta file.
		generateTranslationMetaFile(opts.outputDir, opts.metaDataFile, translationMap);

		logSuccess('Successfully exported translations.');
	}
}

/**
 * Generate translation file.
 * @param outputDir The output directory.
 * @param outputFile The output file.
 * @param translationMap The translation map.
 * @param translationKeys The translation keys.
 * @param translationKeyColumnName The translation key column name.
 * @param localeColumnNames The localeColumnNames.
 */
function generateTranslationFile(outputDir, outputFile,
								 translationMap, translationKeys, translationKeyColumnName, localeColumnNames) {
	// get output file path.
	let outputFilePath = `${outputDir}/${outputFile}`;

	logInfo(`Generating translation file: ${outputFilePath}`);

	cleanFile(outputFilePath);

	// create new csv writer.
	const writer = createWriter(outputFilePath);

	writeTranslationRow(writer, null, translationMap, translationKeyColumnName, localeColumnNames);

	// write a row in the csv file for each translation keys.
	translationKeys.forEach(function (translationKey) {
		writeTranslationRow(writer, translationKey, translationMap, translationKeyColumnName, localeColumnNames);
	});

	writeTranslationRow(writer, null, translationMap, translationKeyColumnName, localeColumnNames);

	writer.end();
}

/**
 * Generate translation file.
 * @param outputDir The output directory.
 * @param outputFile The output file.
 * @param translationMap The translation map.
 * @param oldTranslationMap The old translation map.
 * @param insertedTranslationKeys The translation keys.
 * @param updatedTranslationKeys The translation keys.
 * @param deletedTranslationKeys The translation keys.
 * @param translationKeyColumnName The translation key column name.
 * @param localeColumnNames The localeColumnNames.
 * @param showDeletedInJournal Flag to display deleted translations.
 * @param showOldValueInJournal Flag to display old translations.
 */
function generateJournalFile(outputDir, outputFile, translationMap, oldTranslationMap, insertedTranslationKeys,
							 updatedTranslationKeys, deletedTranslationKeys, translationKeyColumnName, localeColumnNames,
							 showDeletedInJournal, showOldValueInJournal) {

	// get output file path.
	let outputFilePath = `${outputDir}/${outputFile}`;

	logInfo(`Generating translation file: ${outputFilePath}`);

	cleanFile(outputFilePath);

	// create new csv writer.
	const writer = createWriter(outputFilePath);

	writeJournalRow(writer, null, translationMap, oldTranslationMap, translationKeyColumnName, localeColumnNames,
		showOldValueInJournal);

	writeJournalRows(writer, insertedTranslationKeys, translationMap,
		oldTranslationMap, translationKeyColumnName, localeColumnNames, showOldValueInJournal, UpdateType.INSERT);

	writeJournalRows(writer, updatedTranslationKeys, translationMap,
		oldTranslationMap, translationKeyColumnName, localeColumnNames, showOldValueInJournal, UpdateType.UPDATE);

	if (showDeletedInJournal) {

		writeJournalRows(writer, deletedTranslationKeys, translationMap,
			oldTranslationMap, translationKeyColumnName, localeColumnNames, showOldValueInJournal, UpdateType.DELETE);
	}

	writeJournalRow(writer, null, translationMap, oldTranslationMap,
		translationKeyColumnName, localeColumnNames, showOldValueInJournal);

	writer.end();
}

/**
 * Generate translation meta file.
 * @param outputDir The output directory.
 * @param outputFile The output file
 * @param translationMap The translation map.
 */
function generateTranslationMetaFile(outputDir, outputFile, translationMap) {

	let outputFilePath = `${outputDir}/${outputFile}`;

	logInfo(`Generating translation meta data file: ${outputFilePath}`);

	cleanFile(outputFilePath);

	// create new csv writer.
	const writer = createWriter(outputFilePath);

	writer.write({
		LOCALE: '',
		NUMBER_OF_KEYS: '',
		NUMBER_OF_WORDS: ''
	});

	forEachKeys(translationMap, (localeObj, localKey) => {
		writeMetaDataRow(writer, localKey, translationMap);
	});

	writer.end();
}

/**
 * Returns the column name for a locale.
 * @param locale The locale
 * @param localeColumnNames The map of locale column names passed by the command line.
 * @returns {string}
 */
function getLocaleColumnName(locale, localeColumnNames) {
	let columnName = localeColumnNames[locale];
	if (!columnName) {
		columnName = locale;
	}
	return columnName.toUpperCase();
}

/**
 * Returns the column name for a locale.
 * @param locale The locale
 * @param localeColumnNames The map of locale column names passed by the command line.
 * @returns {string}
 */
function getColumnNameFromLocale(locale, localeColumnNames) {
	let columnName = localeColumnNames[locale];
	if (!columnName) {
		columnName = locale;
	}
	return columnName.toUpperCase();
}

/**
 * Returns the list of locales based on the ember-i18n file directory.
 * @returns {Array}
 */
function getLocales(inputDir) {
	// loop throught the list of subdirectories in app/locales
	return fs.readdirSync(inputDir).filter(function (file) {
		return fs.statSync(inputDir + file).isDirectory();
	});
}

/**
 * Returns the translations from the translations data
 * @param translationsData The translations data.
 */
function getTranslations(translationsData) {

	// find where the translations JSON starts.
	let translationsStartIndex = translationsData.indexOf('{');

	// find where the translations JSON ends.
	let translationsEndIndex = translationsData.lastIndexOf('}');

	if (translationsStartIndex < 0 || translationsEndIndex < 0) {
		throw new Error('Unable to parse the translations.');
	}

	// Parse JSON string
	let translations = JSON.parse(translationsData.substring(translationsStartIndex, translationsEndIndex + 1));

	if (!translations) {
		throw new Error('Unable to parse the translations.');
	}
	return translations;
}
/**
 * Returns the flat version of the translations from the translation data.
 * @param translationData The translations
 * @returns {object}
 */
function getFlattenTranslations(translationData) {
	let flattenTranslations = flatten(getTranslations(translationData));
	if (!flattenTranslations) {
		throw new Error('Unable to flatten the translations.');
	}
	return flattenTranslations;
}

/**
 * Reads all transitions files returns a nested JSON object where the
 * first level key is the locale and second level key is the translation key ex:
 * {
 * 	"en": {
 * 		"component1.label.field1": "value"
 * 	},
 * 	"fr": {
 * 		"component1.label.field1": "value [fr]"
 * 	}
 * }
 * @param inputDir The input directory
 * @param inputFile The input file.
 * @returns {Object}
 */
function getTranslationMap(inputDir, inputFile) {
	let locales = getLocales(inputDir);
	let translationsMap = {};
	// loop through each locale and retrieve the translations file.
	locales.forEach(function (locale) {
		let translationFilePath = `${inputDir}${locale}/${inputFile}`;

		logInfo(`Getting translations from: ${translationFilePath}`);

		// if there no transition file but a locale leave  it blank.
		if (fs.existsSync(translationFilePath)) {
			let data = fs.readFileSync(translationFilePath, ENCODING);
			translationsMap[locale] = getFlattenTranslations(data);
		} else {
			translationsMap[locale] = {};
		}
	});
	return translationsMap;
}

/**
 * Returns a array of translations keys for a given translations map
 * @param translationMap The translations map
 * @returns {Array}
 */
function getTranslationKeys(translationMap) {
	const translationKeys = [];
	forEachKeys(translationMap, (localeObj, localKey) => {
		forEachKeys(translationMap[localKey], (translation, translationKey) => {
			// add the translation key if not included.
			if (!arrayContains(translationKeys, translationKey)) {
				translationKeys.push(translationKey);
			}
		});
	});
	return translationKeys;
}

/**
 * This helper function returns the updated
 * @param oldTranslationMap The old translation map
 * @param newTranslationMap Thew new translation map
 * @returns {*}
 */
function getUpdatedTranslationKeys(oldTranslationMap, newTranslationMap) {
	let updatedTranslationKeys = [];
	const deletedTranslationKeys = getDeletedTranslationKeys(oldTranslationMap, newTranslationMap);
	forEachKeys(oldTranslationMap, (localeObj, localKey) => {
		forEachKeys(oldTranslationMap[localKey], (translation, translationKey) => {
			if (oldTranslationMap[localKey][translationKey]
				&& (oldTranslationMap[localKey][translationKey] !== newTranslationMap[localKey][translationKey])
				&& !arrayContains(deletedTranslationKeys, translationKey)) {
				updatedTranslationKeys.push(translationKey);
			}
		});
	});
	return updatedTranslationKeys;
}

/**
 * Returns the array of inserted translation keys since the last export.
 * @param oldTranslationMap oldTranslationMap
 * @param newTranslationMap newTranslationMap
 * @returns {Array}
 */
function getInsertedTranslationKeys(oldTranslationMap, newTranslationMap) {
	const oldTranslationKeys = getTranslationKeys(oldTranslationMap);
	const newTranslationKeys = getTranslationKeys(newTranslationMap);
	let diffTranslationKeys = arrayDiff(oldTranslationKeys, newTranslationKeys);
	return diffTranslationKeys.filter((translationKey) => {
		return (!oldTranslationKeys.includes(translationKey) && newTranslationKeys.includes(translationKey))
	});
}

/**
 * Returns the array of delete translation keys since the last export.
 * @param oldTranslationMap oldTranslationMap
 * @param newTranslationMap newTranslationMap
 * @returns {Array}
 */
function getDeletedTranslationKeys(oldTranslationMap, newTranslationMap) {
	const oldTranslationKeys = getTranslationKeys(oldTranslationMap);
	const newTranslationKeys = getTranslationKeys(newTranslationMap);
	let diffTranslationKeys = arrayDiff(oldTranslationKeys, newTranslationKeys);
	return diffTranslationKeys.filter((translationKey) => {
		return (oldTranslationKeys.includes(translationKey) && !newTranslationKeys.includes(translationKey))
	});
}

/**
 * Write a translation row in the csv file.
 * @param writer The csv writer.
 * @param translationKey The translation key.
 * @param translationMap The translation map.
 * @param translationKeyColumnName The column name for the translation key.
 * @param localeColumnNames The map of column names for a locale.
 */
function writeTranslationRow(writer, translationKey, translationMap, translationKeyColumnName, localeColumnNames) {
	let row = {};

	row[translationKeyColumnName] = translationKey;

	forEachKeys(translationMap, (localeObj, localKey) => {
		row[getLocaleColumnName(localKey, localeColumnNames)] = translationMap[localKey][translationKey];
	});

	writer.write(row);
}

function writeJournalRows(writer, translationKeys, translationMap, oldTranslationMap,
						  translationKeyColumnName, localeColumnNames, showOldValueInJournal, updateType) {
	// write a row in the csv file for each translation keys.
	translationKeys.forEach(function (translationKey) {
		writeJournalRow(writer, translationKey, translationMap,
			oldTranslationMap, translationKeyColumnName, localeColumnNames, showOldValueInJournal, updateType);
	});
}

/**
 * Write journal row in the csv file.
 * @param writer The csv writer.
 * @param translationKey The translation key.
 * @param translationMap The translation map.
 * @param oldTranslationMap The old translation map.
 * @param translationKeyColumnName The column name for the translation key.
 * @param localeColumnNames The map of column names for a locale.
 * @param updateType The update type.
 * @param showOldValueInJournal showOldTranslations
 */
function writeJournalRow(writer, translationKey, translationMap, oldTranslationMap,
						 translationKeyColumnName, localeColumnNames, showOldValueInJournal, updateType) {
	let row = {};

	row[translationKeyColumnName] = translationKey;

	forEachKeys(translationMap, (localeObj, localKey) => {
		row[getLocaleColumnName(localKey, localeColumnNames)] = translationMap[localKey][translationKey];
	});

	if (showOldValueInJournal) {
		forEachKeys(oldTranslationMap, (localeObj, localKey) => {
			row[getLocaleColumnName(localKey, localeColumnNames) + '_OLD'] = oldTranslationMap[localKey][translationKey];
		});
	}

	row['UPDATE_TYPE'] = updateType;

	writer.write(row);
}

/**
 * Write the meta data information about a locale.
 * @param writer The csv writer
 * @param localeKey The locale.
 * @param translationMap The translation map.
 */
function writeMetaDataRow(writer, localeKey, translationMap) {
	let row = {};
	row['LOCALE'] = localeKey;
	let localeWordCount = 0;
	let keyCount = 0;

	forEachKeys(translationMap[localeKey], (translation, translationKey) => {
		localeWordCount = localeWordCount + wordCount(translationMap[localeKey][translationKey]);
	});

	row['NUMBER_OF_WORDS'] = localeWordCount;
	row['NUMBER_OF_KEYS'] = keyCount;
	writer.write(row);
}

/**
 * Returns the locale from the column name.
 * @param columnName The column name.
 * @param localeColumnNames The map of locale column names mapping.
 */
function getLocaleFromColumnName(columnName, localeColumnNames) {
	if (localeColumnNames) {
		for (let locale in localeColumnNames) {
			if (localeColumnNames.hasOwnProperty(locale) && columnName === localeColumnNames[locale]) {
				return locale;
			}
		}
	}
	return columnName.toLowerCase();
}

/**
 * Helper function returns is journal is generated.
 * @param insertedTranslationKeys The inserted translations keys.
 * @param updatedTranslationKeys The updated translations keys.
 * @param deletedTranslationKeys The delete translation keys,.
 * @param showDeletedInJournal The show deleted in journal flag.
 * @returns {boolean}
 */
function isJournalGenerated(insertedTranslationKeys, updatedTranslationKeys, deletedTranslationKeys, showDeletedInJournal) {
	return (insertedTranslationKeys && insertedTranslationKeys.length > 0) ||
		(updatedTranslationKeys && updatedTranslationKeys.length > 0) ||
		(showDeletedInJournal && deletedTranslationKeys && deletedTranslationKeys.length > 0);
}

/**
 * Helper function to log a success.
 * @param msg The message
 */
function logSuccess(msg) {
	console.log(chalk.green(msg));
	console.log();
}

/**
 * Helper function to log a warning.
 * @param msg The message.
 */
function logWarning(msg) {
	console.log(chalk.yellow(msg));
	console.log();
}

/**
 * Helper function to log a info.
 * @param msg The message.
 */
function logInfo(msg) {
	console.log(msg);
	console.log();
}

/**
 * Helper function to log options.
 * @param opts
 */
function logOptions(opts) {
	console.log(chalk.blue('Exporting translations using the following options:'));
	console.log();
	console.log(chalk.blue(`inputDir: ${opts.inputDir}`));
	console.log(chalk.blue(`inputFile: ${opts.inputFile}`));
	console.log(chalk.blue(`outputDir: ${opts.outputDir}`));
	console.log(chalk.blue(`outputFile: ${opts.outputFile}`));
	console.log(chalk.blue(`journalFile: ${opts.journalFile}`));
	console.log(chalk.blue(`metaDataFile: ${opts.metaDataFile}`));
	console.log(chalk.blue(`showDeletedInJournal: ${opts.showDeletedInJournal}`));
	console.log(chalk.blue(`showOldValueInJournal: ${opts.showOldValueInJournal}`));
	console.log(chalk.blue(`translationKeyColumnName: ${opts.translationKeyColumnName}`));
	console.log(chalk.blue(`localeColumnNames: ${JSON.stringify(opts.localeColumnNames)}`));
	console.log();
}

/**
 * Helper function to create writer.
 * @param filePath The file path.
 * @returns {CsvWriteStream}
 */
function createWriter(filePath) {
	// create new csv writer.
	let writer = csvWriter();

	// create a write stream.
	writer.pipe(fs.createWriteStream(filePath, {
		defaultEncoding: BINARY_ENCODING,
	}));

	return writer;
}

/**
 * Helper function to clean file.
 * @param filePath The file path.
 */
function cleanFile(filePath) {
	if (fs.existsSync(filePath)) {
		fs.unlinkSync(filePath);
	}
}

/**
 * Helper function to clean directory.
 * @param dirPath The directory path.
 */
function cleanDirectory(dirPath) {
	// check if output directory exists, if not create it.
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath);
	}
}
