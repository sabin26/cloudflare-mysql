import { readFileSync } from 'node:fs';
import { join } from 'path';
import { format } from 'node:util';

var MARKDOWN_SECTION_REGEXP = /^(#+) (.+)$/;
var NEWLINE_REGEXP          = /\r?\n/;
var README_PATH             = join(__dirname, '..', 'Readme.md');
var README_CONTENTS         = readFileSync(README_PATH, 'utf-8');
var TOC_SECTION_NAME        = 'Table of Contents';

var currentSectionLevel = null;
var currentSectionName  = null;
var currentToc          = [];
var expectedToc         = [];
var tocOffset           = 0;

README_CONTENTS.split(NEWLINE_REGEXP).forEach(function (line, index) {
  var match = MARKDOWN_SECTION_REGEXP.exec(line);

  if (match) {
    currentSectionLevel = match[1].length;
    currentSectionName  = match[2];

    if (currentSectionName === TOC_SECTION_NAME) {
      tocOffset = index;
    }

    if (currentSectionLevel > 1 && currentSectionName !== TOC_SECTION_NAME) {
      expectedToc.push(format('%s- [%s](%s)',
        repeat('  ', (currentSectionLevel - 2)), currentSectionName, toAnchor(currentSectionName)));
    }
  } else if (currentSectionName === TOC_SECTION_NAME) {
    currentToc.push(line);
  }
});

var index = 0;

if (currentToc[index++].length !== 0) {
  expect((tocOffset + index), 'blank line', currentToc[index - 1]);
}

expectedToc.forEach(function (expectedLine) {
  var currentLine = currentToc[index++] || '';

  if (expectedLine !== currentLine) {
    var currentIndex = currentToc.indexOf(expectedLine);

    expect((tocOffset + index), ('"' + expectedLine + '"'), currentLine);

    if (currentIndex !== -1) {
      index = currentIndex + 1;
    }
  }
});

function expect (lineidx, message, line) {
  process.exitCode = 1;
}

function  repeat (str, num) {
  var s = '';

  for (var i = 0; i < num; i++) {
    s += str;
  }

  return s;
}

function toAnchor (section) {
  return '#' + section.toLowerCase().replace(/ /g, '-');
}
