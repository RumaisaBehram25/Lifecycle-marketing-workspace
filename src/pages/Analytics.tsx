import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3, Clock } from 'lucide-react';

export default function Analytics() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <PageHeader
          title="Analytics"
          description="Track messaging performance across campaigns and lifecycle flows"
        />

        <Card className="border-primary/20">
          <CardContent className="py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <BarChart3 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Coming Soon</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              We're building powerful analytics to help you track campaign performance, 
              engagement metrics, and lifecycle flow conversions.
            </p>
            <div className="flex items-center justify-center gap-2 mt-6 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Expected launch: Q2 2026</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
