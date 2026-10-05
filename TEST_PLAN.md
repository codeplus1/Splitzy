# Hisab Sathi — Comprehensive Quality Assurance Test Plan

**Document Version:** 1.0.0  
**Test Lead:** Senior Software QA Engineer & Production-Readiness Tester  
**Target Application:** Hisab Sathi  
**Test Approach:** Systematic verification of implemented features, edge-case analysis, and financial invariant testing.

---

## 1. Test Scope & Principles

### In-Scope:
- Group creation, member roster management, and group settings.
- Expense entry across all 3 split algorithms (Equal, Exact, Percentage).
- Foreign currency conversion and exchange rate handling.
- Debt calculation, member net balances, and debt simplification.
- Settlement recording and balance reduction.
- Dual calendar formatting (Bikram Sambat BS & Gregorian AD).
- Receipt photo capture and local/cloud storage.
- LocalStorage caching and Firestore real-time synchronization.
- Bilingual localization (English and Nepali).

### Out-of-Scope (Not Implemented by Design — Not Bugs):
- User account authentication / Sign-up / Login / Password reset.
- Automated payment gateway integration (eSewa / Khalti API execution).
- Multi-tier group permission roles (all members are currently equal peers).

---

## 2. Test Suites & Test Cases

### Test Suite 1: Mathematical Accuracy & Split Modes
| Test Case ID | Description | Input / Condition | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **TC-MATH-01** | Equal Split with Indivisible Amount | Amount: Rs. 100.00, Members: 3 (A, B, C) | A: 33.34, B: 33.33, C: 33.33. Sum = 100.00 exactly. | **PASSED** |
| **TC-MATH-02** | Equal Split with Single Participant | Amount: Rs. 500.00, Members: 1 (A) | A: 500.00. Sum = 500.00. | **PASSED** |
| **TC-MATH-03** | Exact Split Sum Validation Failure | Total: Rs. 1,000. Inputs: A=500, B=400 (Sum=900) | Validation error: "Total must equal 1000, current sum is 900". Submission blocked. | **PASSED** |
| **TC-MATH-04** | Percentage Split Validation Failure | Total: Rs. 1,000. Inputs: A=50%, B=40% (Sum=90%) | Validation error: "Total percentage must be 100%, current sum is 90%". Submission blocked. | **PASSED** |
| **TC-MATH-05** | Percentage Split Non-Divisible Total | Total: Rs. 1,000. Inputs: A=33.33%, B=33.33%, C=33.34% | A: 333.30, B: 333.30, C: 333.40. Sum = 1,000.00. | **PASSED** |

---

### Test Suite 2: Currency & Exchange Rate
| Test Case ID | Description | Input / Condition | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **TC-CURR-01** | Foreign Currency Conversion | Currency: USD, Amount: $10, Rate: 133.50, Base: NPR | Base amount calculated as Rs. 1,335.00. | **PASSED** |
| **TC-CURR-02** | Zero/Negative Exchange Rate Guard | Exchange Rate: 0 or -1 | Submission blocked with message: "Exchange rate must be a valid number greater than 0". | **PASSED** |
| **TC-CURR-03** | Multi-Currency Dashboard Banner | Group 1 in NPR (Net: +1,500), Group 2 in USD (Net: -20) | Primary currency displayed clearly; secondary currency rendered in dedicated badge without scalar addition. | **PASSED** |

---

### Test Suite 3: Form Interaction & Concurrency
| Test Case ID | Description | Input / Condition | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **TC-FORM-01** | Rapid Double-Click on Save Expense | Double-click submit button quickly | Only one expense record created. Button disabled and shows "Saving...". | **PASSED** |
| **TC-FORM-02** | Rapid Double-Click on Create Group | Double-click create button quickly | Only one group created. Button disabled and shows "Creating...". | **PASSED** |
| **TC-FORM-03** | Rapid Double-Click on Record Settlement | Double-click settle button quickly | Only one settlement recorded. Button disabled and shows "Recording...". | **PASSED** |
| **TC-FORM-04** | Duplicate Member Name in Create Group | Add "Ramesh" twice | Second addition rejected with message: "A member named 'Ramesh' is already in this list." | **PASSED** |
| **TC-FORM-05** | Duplicate Member Name in Group Detail | Add existing member name | Rejected with error toast: "A member named '<name>' is already in this group." | **PASSED** |

---

### Test Suite 4: Lifecycle & Data Integrity
| Test Case ID | Description | Input / Condition | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **TC-DATA-01** | Edit Expense Reducing Participants | Change 4-member expense to 2 members | Stale Firestore share records deleted via batch; balances reflect updated 2 members accurately. | **PASSED** |
| **TC-DATA-02** | Delete Group Cascade | Delete group with expenses and settlements | Group, expenses, expense shares, settlements, and group members are cleanly removed without orphaned records. | **PASSED** |
| **TC-DATA-03** | Delete Expense Cascade | Delete expense | Associated expense shares deleted in batch and member balances recalculated. | **PASSED** |

---

### Test Suite 5: Nepali Calendar & Formatting
| Test Case ID | Description | Input / Condition | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **TC-CAL-01** | AD to BS Boundary Conversion | Gregorian: 2024-04-13 vs 2024-04-14 | Chaitra 31, 2080 BS vs Baisakh 01, 2081 BS mapped correctly. | **PASSED** |
| **TC-CAL-02** | Timezone Invariance in Dual Date | User timezone set to PST (UTC-8) | Date does not shift backwards by one day; AD and BS match UTC date component accurately. | **PASSED** |

---

## 3. Production Readiness Sign-Off Checklist
- [x] Zero compilation errors (`npm run build` succeeds).
- [x] Zero TypeScript diagnostics (`tsc --noEmit` succeeds).
- [x] All modal buttons protected against duplicate rapid clicks.
- [x] Minor units integer math prevents float rounding errors.
- [x] Dual-date converter timezone-invariant.
- [x] Multi-currency aggregation guarded on dashboard.
- [x] Stale share documents cleaned up on expense editing.
- [x] Cascade cleanup implemented for group deletion.
