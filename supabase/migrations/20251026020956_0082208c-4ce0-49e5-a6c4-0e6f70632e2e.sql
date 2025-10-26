-- Create producer_goals table for tracking daily/monthly targets
CREATE TABLE IF NOT EXISTS public.producer_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  producer_id UUID NOT NULL,
  month TEXT NOT NULL,
  daily_target INTEGER DEFAULT 5,
  monthly_target INTEGER DEFAULT 100,
  monthly_revenue_target DECIMAL(10, 2) DEFAULT 50000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  UNIQUE(producer_id, month)
);

-- Enable RLS
ALTER TABLE public.producer_goals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own goals"
  ON public.producer_goals FOR SELECT
  USING (auth.uid() = producer_id);

CREATE POLICY "Users can insert their own goals"
  ON public.producer_goals FOR INSERT
  WITH CHECK (auth.uid() = producer_id);

CREATE POLICY "Users can update their own goals"
  ON public.producer_goals FOR UPDATE
  USING (auth.uid() = producer_id);

-- Admins can view all goals
CREATE POLICY "Admins can view all goals"
  ON public.producer_goals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Create index
CREATE INDEX idx_producer_goals_producer_month ON public.producer_goals(producer_id, month);