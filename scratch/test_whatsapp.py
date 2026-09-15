import re
import sys

def format_phone_brazil(phone):
    if not phone: return ''
    cleaned = re.sub(r'\D', '', phone)
    if len(cleaned) < 8: return ''
    
    if len(cleaned) == 13 and cleaned.startswith('55'):
        ddd = cleaned[2:4]
        number = cleaned[5:]
        cleaned = f"55{ddd}{number}"
    elif len(cleaned) == 11 and not cleaned.startswith('55'):
        ddd = cleaned[0:2]
        number = cleaned[3:]
        cleaned = f"55{ddd}{number}"
    elif len(cleaned) == 10 and not cleaned.startswith('55'):
        cleaned = f"55{cleaned}"
    elif len(cleaned) == 12 and not cleaned.startswith('55'):
        cleaned = f"55{cleaned[2:]}"
    elif not cleaned.startswith('55'):
        cleaned = f"55{cleaned}"
        
    return cleaned

test_cases = [
    { 'input': '5567999998888', 'expected': '556799998888' }, # 13 digits, removes 9th digit
    { 'input': '67999998888', 'expected': '556799998888' },  # 11 digits, adds 55 and removes 9th digit
    { 'input': '6788888888', 'expected': '556788888888' },   # 10 digits, adds 55
    { 'input': '556788888888', 'expected': '556788888888' }, # 12 digits, stays correct
    { 'input': '+55 (67) 99999-8888', 'expected': '556799998888' }, # formatted string
]

print("Testing Phone Number Formatting...")
all_passed = True

for tc in test_cases:
    result = format_phone_brazil(tc['input'])
    passed = result == tc['expected']
    print(f"Input: \"{tc['input']}\" -> Result: \"{result}\" | Expected: \"{tc['expected']}\" | {'✅ PASS' if passed else '❌ FAIL'}")
    if not passed: all_passed = False

if all_passed:
    print("\nAll format tests passed successfully!")
    sys.exit(0)
else:
    print("\nSome format tests failed!")
    sys.exit(1)
