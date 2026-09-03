export interface TestPlanItem {
  section: "Test plan" | "How to Verify";
  text: string;
  checked: boolean | null;
}

export interface ExtractedTestPlan {
  sections: Array<TestPlanItem["section"]>;
  items: TestPlanItem[];
}

export function extractPlan(markdown: string): ExtractedTestPlan;
