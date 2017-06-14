#!/usr/bin/env node
'use strict';

let program = require('commander');
let fs = require('fs');
let flatten = require('flat');
let csvWriter = require('csv-write-stream');
let wordCount = require('wordcount');
let arrayContains = require('array-contains');
let chalk = require('chalk');

const ENCODING = 'UTF-8';
const BINARY_ENCODING = 'binary';
const DEFAULT_INPUT_DIR = 'app/locales/';
const DEFAULT_INPUT_FILE = 'translations.js';
const DEFAULT_OUTPUT_DIR = 'i18n-exports';
const DEFAULT_OUTPUT_FILE = 'translations.csv';
const DEFAULT_OUTPUT_META_DATA_FILE = 'translations-meta.csv';
const DEFAULT_TRANSLATION_KEY_COLUMN_NAME = 'SYSTEM_KEY';

let inputDir = DEFAULT_INPUT_DIR;
let inputFile = DEFAULT_INPUT_FILE;
let outputDir = DEFAULT_OUTPUT_DIR;
let outputFile = DEFAULT_OUTPUT_FILE;
let outputMetaDataFile = DEFAULT_OUTPUT_META_DATA_FILE;
let localeColumnNames = {};
let translationKeyColumnName = DEFAULT_TRANSLATION_KEY_COLUMN_NAME;

program
	.version('1.0.0')
	.option('--inputDir [inputDir]', 'The input directory for locales. Defaults to app/locales')
	.option('--inputFile [inputFile]', 'The input translation file for locales. Defaults to translations.js')
	.option('--outputFile [outputFile]', 'The output csv file. Defaults to translations.cvs')
	.option('--outputMetaDataFile [outputMetaDataFile]', 'The output csv file for meta information about each locale. Defaults to translations-meta.csv')
	.option('--outputDir [outputDir]', 'The output directory. Defaults to i18n-exports')
	.option('--translationKeyColumnName [translationKeyColumnName]',
		'The column name for the translation key. Defaults to SYSTEM_KEY')
	.option('--localeColumnNames [localeColumnNames]', 'The column names for each locales. Use the locale name as the key. ' +
		'Defaults to {\\\"en\\\:\\\"EN\\\",\\\"fr\\\": \\\"FR\\\"}')
	.parse(process.argv);

if (program.inputDir) {
	inputDir = program.inputDir;
}

if (program.inputFile) {
	inputFile = program.inputFile;
}

if (program.outputFile) {
	outputFile = program.outputFile;
}

if (program.outputMetaDataFile) {
	outputMetaDataFile = program.outputMetaDataFile;
}

if (program.outputDir) {
	outputDir = program.outputDir;
}

if (program.localeColumnNames) {
	localeColumnNames = JSON.parse(program.localeColumnNames);
}

if (program.translationKeyColumnName) {
	translationKeyColumnName = program.translationKeyColumnName.toUpperCase();
}

exportTranslations(inputDir, inputFile, outputDir, outputFile,
	outputMetaDataFile, translationKeyColumnName, localeColumnNames);

/**
 * Main function
 * @param inputDir The input directory.
 * @param inputFile The input file.
 * @param outputDir The output directory.
 * @param outputFile The output file.
 * @param outputMetaDataFile The output meta file.
 * @param translationKeyColumnName The translationKeyColumnName.
 * @param localeColumnNames The localeColumnNames.
 */
function exportTranslations(inputDir, inputFile, outputDir, outputFile,
							outputMetaDataFile, translationKeyColumnName, localeColumnNames) {
	console.log(chalk.blue('Exporting translations using the following options:'));
	console.log();
	console.log(chalk.blue(`inputDir: ${inputDir}`));
	console.log(chalk.blue(`inputFile: ${inputFile}`));
	console.log(chalk.blue(`outputDir: ${outputDir}`));
	console.log(chalk.blue(`outputFile: ${outputFile}`));
	console.log(chalk.blue(`outputMetaDataFile: ${outputMetaDataFile}`));
	console.log(chalk.blue(`translationKeyColumnName: ${translationKeyColumnName}`));
	console.log(chalk.blue(`localeColumnNames: ${JSON.stringify(localeColumnNames)}`));

	// get translation map.
	let translationMap = getTranslationMap(inputDir, inputFile);

	// get translation keys.
	let translationKeys = getTranslationKeys(translationMap);

	// check if output directory exists, if not create it.
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir);
	}

	// generate the translation file.
	generateTranslationFile(outputDir, outputFile, translationMap, translationKeys,
		translationKeyColumnName, localeColumnNames);

	// generate the translation meta file.
	generateTranslationMetaFile(outputDir, outputMetaDataFile, translationMap);

	console.log();
	console.log(chalk.green('Successfully exported translations.'));
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

	console.log();
	console.log(`Generating translation file: ${outputFilePath}`);

	// check if output file exists, if no delete it.
	if (fs.existsSync(outputFilePath)) {
		fs.unlinkSync(outputFilePath);
	}

	// create new csv writer.
	let writer = csvWriter();

	// create a write stream.
	writer.pipe(fs.createWriteStream(outputFilePath, {
		defaultEncoding: BINARY_ENCODING,
	}));

	writeTranslationRow(writer, null, translationMap, translationKeyColumnName, localeColumnNames);

	// write a row in the csv file for each translation keys.
	translationKeys.forEach(function (translationKey) {
		writeTranslationRow(writer, translationKey, translationMap, translationKeyColumnName, localeColumnNames);
	});

	writeTranslationRow(writer, null, translationMap, translationKeyColumnName, localeColumnNames);

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

	console.log();
	console.log(`Generating translation meta data file: ${outputFilePath}`);

	// generate meta file.
	let writer = csvWriter();

	if (fs.existsSync(outputFilePath)) {
		fs.unlinkSync(outputFilePath);
	}

	writer.pipe(fs.createWriteStream(outputFilePath, {
		defaultEncoding: BINARY_ENCODING,
	}));

	writer.write({
		LOCALE: '',
		NUMBER_OF_KEYS: '',
		NUMBER_OF_WORDS: ''
	});

	// write a row for each locale.
	for (let locale in translationMap) {
		if (translationMap.hasOwnProperty(locale)) {
			writeMetaDataRow(writer, locale, translationMap);
		}
	}

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
	// flatten JSON object.
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

		console.log();
		console.log(`Getting translations from: ${translationFilePath}`);

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
	// loop through all locale and translation keys.
	for (let locale in translationMap) {
		if (translationMap.hasOwnProperty(locale)) {
			for (let translationKey in translationMap[locale]) {
				if (translationMap[locale].hasOwnProperty(translationKey)
					&& !arrayContains(translationKeys, translationKey)) {
					translationKeys.push(translationKey);
				}
			}
		}
	}
	return translationKeys;
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
	for (let locale in translationMap) {
		if (translationMap.hasOwnProperty(locale)) {
			row[getLocaleColumnName(locale, localeColumnNames)] = translationMap[locale][translationKey];
		}
	}
	writer.write(row);
}

/**
 * Write the meta data information about a locale.
 * @param writer The csv writer
 * @param locale The locale.
 * @param translationMap The translation map.
 */
function writeMetaDataRow(writer, locale, translationMap) {
	let row = {};
	row['LOCALE'] = locale;
	let localeWordCount = 0;
	let keyCount = 0;
	for (let translationKey in translationMap[locale]) {
		keyCount++;
		if (translationMap[locale].hasOwnProperty(translationKey)) {
			localeWordCount = localeWordCount + wordCount(translationMap[locale][translationKey]);
		}
	}
	row['NUMBER_OF_WORDS'] = localeWordCount;
	row['NUMBER_OF_KEYS'] = keyCount;
	writer.write(row);
}
