import { ComparisonTool } from '@/app/components/comparison/ComparisonTool';

export const metadata = {
  title: 'Compare Confessions - xConfess',
  description: 'Compare selected confessions side by side',
};

export default function ComparePage() {
  return (
    <div className="space-y-6">
      <ComparisonTool />
    </div>
  );
}