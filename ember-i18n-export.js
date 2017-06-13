#!/usr/bin/env node
'use strict';

let program = require('commander');
let fs = require('fs');
let flatten = require('flat');
let csvWriter = require('csv-write-stream');
let wordCount = require('wordcount');
let arrayContains = require('array-contains');

const ENCODING = 'UTF-8';
const TRANSLATION_BASE_DIR = 'app/locales/';
const TRANSLATION_FILE_NAME = 'translations.js';
const DEFAULT_OUTPUT_DIR = 'i18n-exports';
const DEFAULT_OUTPUT_FILE = 'translations.csv';
const DEFAULT_TRANSLATION_KEY_COLUMN_NAME = 'SYSTEM_KEY';
const DEFAULT_WORD_COUNT_SUFFIX = '_WORD_COUNT';

let showWordCount = true;
let outputDir = DEFAULT_OUTPUT_DIR;
let outputFile = DEFAULT_OUTPUT_FILE;
let localeColumnNames = {};

program
	.version('1.0.0')
	.option('--outputFile [outputFile]', 'The output csv file. Defaults to translations.cvs')
	.option('--outputDir [outputDir]', 'The output directory. Defaults to i18n-exports')
	.option('--showWordCount [showWordCount]', 'Show word counts. Default to true')
	.option('--translationKeyColumnName [translationKeyColumnName]',
		'The column name for the translation key. Defaults to SYSTEM_KEY')
	.option('--localeColumnNames [localeColumnNames]', 'The column names for each locales. Use the locale name as the key. ' +
		'Defaults to {\\\"en\\\:\\\"EN\\\",\\\"fr\\\": \\\"FR\\\"}')
	.option('--wordCountColumnNameSuffix [wordCountColumnNameSuffix]', 'The suffix appended for word count columns. Default to WORD_COUNT')
	.parse(process.argv);

if (program.showWordCount === 'false') {
	showWordCount = false;
}

if (program.outputFile) {
	outputFile = program.outputFile;
}

if (program.outputDir) {
	outputDir = program.outputDir;
}

if (program.localeColumnNames) {
	localeColumnNames = JSON.parse(program.localeColumnNames);
}

generateFile();

function generateFile() {

	//get output file path.
	let outputFilePath = `${outputDir}/${outputFile}`;

	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir);
	}

	if (fs.existsSync(outputFilePath)) {
		fs.unlinkSync(outputFilePath);
	}

	let writer = csvWriter();

	writer.pipe(fs.createWriteStream(outputFilePath, {
		defaultEncoding: 'binary',
	}));

	let translationMap = getTranslationMap();
	let translationKeys = getTranslationKeys(translationMap);

	writeRow(writer, null, translationMap);

	translationKeys.forEach(function (translationKey) {
		writeRow(writer, translationKey, translationMap);
	});

	writeRow(writer, null, translationMap);

	if (showWordCount) {
		writeCountSummaryRow(writer, translationMap);
	}

	writer.end();
}

function getWordCountColumnNameSuffix() {
	if (program.wordCountColumnNameSuffix) {
		return "_" + program.wordCountColumnNameSuffix.toUpperCase();
	}
	return DEFAULT_WORD_COUNT_SUFFIX;
}

/**
 * Returns the column name for a locale.
 * @param locale The locale
 * @returns {string}
 */
function getLocaleColumnName(locale) {
	let columnName = localeColumnNames[locale];
	if (!columnName) {
		columnName = locale;
	}
	return columnName.toUpperCase();
}

/**
 * Returns the column name for the translation key.
 * defaults to TRANSLATION_KEY
 * @returns {String}
 */
function getTranslationKeyColumnName() {
	if (program.translationKeyColumnName) {
		return program.translationKeyColumnName.toUpperCase();
	}
	return DEFAULT_TRANSLATION_KEY_COLUMN_NAME;
}

/**
 * Returns the list of locales based on the ember-i18n file directory.
 * @returns {Array}
 */
function getLocales() {
	// loop throught the list of subdirectories in app/locales
	return fs.readdirSync(TRANSLATION_BASE_DIR).filter(function (file) {
		return fs.statSync(TRANSLATION_BASE_DIR + file).isDirectory();
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
 * @returns {Object}
 */
function getTranslationMap() {
	let locales = getLocales();
	let translationsMap = {};
	// loop through each locale and retrieve the translations file.
	locales.forEach(function (locale) {
		let translationFilePath = `${TRANSLATION_BASE_DIR}${locale}/${TRANSLATION_FILE_NAME}`;
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
 * Write a row in the csv file.
 * @param writer The csv writer.
 * @param translationKey The translation key.
 * @param translationMap The translation map.
 */
function writeRow(writer, translationKey, translationMap) {
	let row = {};
	row[getTranslationKeyColumnName()] = translationKey;
	for (let locale in translationMap) {
		if (translationMap.hasOwnProperty(locale)) {
			const translation = translationMap[locale][translationKey];
			row[getLocaleColumnName(locale)] = translation;
			if (showWordCount) {
				if (translation) {
					row[`${getLocaleColumnName(locale)}${getWordCountColumnNameSuffix()}`] = wordCount('' + translation);//
				} else {
					row[`${getLocaleColumnName(locale)}${getWordCountColumnNameSuffix()}`] = null;
				}
			}
		}
	}
	writer.write(row);
}

/**
 * Write the count summary for each locale.
 * @param writer The csv writer
 * @param translationMap The translation map.
 */
function writeCountSummaryRow(writer, translationMap) {
	let row = {};
	row[getTranslationKeyColumnName()] = '';
	for (let localeKey in translationMap) {
		let localeWordCount = 0;
		if (translationMap.hasOwnProperty(localeKey)) {
			for (let translationKey in translationMap[localeKey]) {
				if (translationMap[localeKey].hasOwnProperty(translationKey)) {
					localeWordCount = localeWordCount + wordCount(translationMap[localeKey][translationKey]);
				}
			}
			row[getLocaleColumnName(localeKey)] = '';
			row[`${getLocaleColumnName(localeKey)}${getWordCountColumnNameSuffix()}`] = `Total words: ${localeWordCount} `;//
		}
	}
	writer.write(row);
}
