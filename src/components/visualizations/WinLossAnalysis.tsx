import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface WinLossData {
  reason: string;
  count: number;
  value?: number;
  [key: string]: string | number | undefined;
}

interface WinLossAnalysisProps {
  wonReasons: WinLossData[];
  lostReasons: WinLossData[];
  title?: string;
  description?: string;
}

const WIN_COLORS = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];
const LOSS_COLORS = ['#ef4444', '#f87171', '#fca5a5', '#fecaca'];

export function WinLossAnalysis({ wonReasons, lostReasons, title = "Win/Loss Analysis", description }: WinLossAnalysisProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Won Reasons */}
          <div className="space-y-4">
            <h4 className="font-semibold text-green-600">Why We Win</h4>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={wonReasons}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ reason, percent }: any) => 
                    percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {wonReasons.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={WIN_COLORS[index % WIN_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {wonReasons.map((item, index) => (
                <div key={item.reason} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: WIN_COLORS[index % WIN_COLORS.length] }}
                    />
                    <span>{item.reason}</span>
                  </div>
                  <span className="font-semibold">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Lost Reasons */}
          <div className="space-y-4">
            <h4 className="font-semibold text-red-600">Why We Lose</h4>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={lostReasons}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ reason, percent }: any) => 
                    percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {lostReasons.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={LOSS_COLORS[index % LOSS_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {lostReasons.map((item, index) => (
                <div key={item.reason} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: LOSS_COLORS[index % LOSS_COLORS.length] }}
                    />
                    <span>{item.reason}</span>
                  </div>
                  <span className="font-semibold">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
