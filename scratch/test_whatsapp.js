'use strict';

const { formatPhoneBrazil } = require('../middleware/src/utils/whatsapp');

// Test phone number formatting
const testCases = [
    { input: '5567999998888', expected: '556799998888' }, // 13 digits, removes 9th digit
    { input: '67999998888', expected: '556799998888' },  // 11 digits, adds 55 and removes 9th digit
    { input: '6788888888', expected: '556788888888' },   // 10 digits, adds 55
    { input: '556788888888', expected: '556788888888' }, // 12 digits, stays correct
    { input: '+55 (67) 99999-8888', expected: '556799998888' }, // formatted string
];

console.log('Testing Phone Number Formatting...');
let allPassed = true;

for (const tc of testCases) {
    const result = formatPhoneBrazil(tc.input);
    const passed = result === tc.expected;
    console.log(`Input: "${tc.input}" -> Result: "${result}" | Expected: "${tc.expected}" | ${passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!passed) allPassed = false;
}

if (allPassed) {
    console.log('\nAll format tests passed successfully!');
} else {
    console.error('\nSome format tests failed!');
    process.exit(1);
}
