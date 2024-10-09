#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get input and output file paths from command line arguments, or use defaults
const inputFilePath = process.argv[2] || path.join(__dirname, 'sample-events.csv');
const outputFilePath = process.argv[3] || path.join(__dirname, 'sample-events.json');

// Resolve absolute paths for better file handling
const inputPath = path.resolve(inputFilePath);
const outputPath = path.resolve(outputFilePath);

console.log('Reading from:', inputPath);
console.log('Writing to:', outputPath);

// Read the CSV file
fs.readFile(inputPath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading input file:', err);
    return;
  }

  // Split the CSV content into rows
  const rows = data.trim().split('\n');

  // Parse each row into an array, handling the JSON column (4th column)
  const result = rows.map(row => {
    const columns = row.split(',');

    // Extract and clean the JSON-like string in the 4th column
    const jsonString = columns.slice(3).join(',').trim();
    const cleanedJsonString = jsonString
      .replace(/^"|"$/g, '') // Remove surrounding double quotes
      .replace(/'([^']*?)'/g, '"$1"') // Replace single quotes with double quotes for keys and values
      .replace(/""/g, '"'); // Replace double double quotes with single double quotes for escaped quotes
    
    let jsonColumn;
    try {
      jsonColumn = JSON.parse(cleanedJsonString);
    } catch (e) {
      console.error('Error parsing JSON in row:', row, '\nCleaned JSON String:', cleanedJsonString);
      process.exit(1);
    }

    // Replace the original 4th column with the parsed JSON object
    return [
      Number(columns[0]),
      columns[1],
      columns[2],
      jsonColumn
    ];
  });

  // Write the result as JSON to the specified output file
  fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8', err => {
    if (err) {
      console.error('Error writing JSON file:', err);
    } else {
      console.log('JSON file has been saved to', outputPath);
    }
  });
});
