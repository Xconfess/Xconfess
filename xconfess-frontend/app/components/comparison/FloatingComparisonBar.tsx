'use client';

import { useComparisonStore } from '@/app/lib/store/comparisonStore';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { X, BarChart3 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function FloatingComparisonBar() {
  const { selectedIds, removeItem, clearItems } = useComparisonStore();
  const router = useRouter();

  if (selectedIds.length === 0) {
    return null;
  }

  const handleCompare = () => {
    const params = new URLSearchParams();
    params.set('ids', selectedIds.join(','));
    router.push(`/compare?${params.toString()}`);
  };

  return (
    <Card className="fixed bottom-4 right-4 z-50 p-4 shadow-lg">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          <span className="text-sm font-medium">
            {selectedIds.length} selected
          </span>
        </div>

        <div className="flex gap-1">
          {selectedIds.map(id => (
            <Button
              key={id}
              variant="outline"
              size="sm"
              onClick={() => removeItem(id)}
              className="h-6 px-2"
            >
              {id.slice(0, 4)}...
              <X className="h-3 w-3 ml-1" />
            </Button>
          ))}
        </div>

        <Button onClick={handleCompare} size="sm">
          Compare
        </Button>

        <Button variant="ghost" size="sm" onClick={clearItems}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}