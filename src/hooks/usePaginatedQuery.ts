import { useState } from 'react';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PaginationOptions {
  pageSize: number;
  defaultPage?: number;
}

interface PaginatedResult<T> {
  data: T[] | null;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface UsePaginatedQueryResult<T> extends PaginatedResult<T> {
  isLoading: boolean;
  error: Error | null;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  refetch: () => void;
}

export function usePaginatedQuery<T = any>(
  tableName: string,
  options: PaginationOptions,
  queryOptions?: Omit<UseQueryOptions<any, any, any, any>, 'queryKey' | 'queryFn'>
): UsePaginatedQueryResult<T> {
  const [page, setPage] = useState(options.defaultPage || 1);
  const [pageSize, setPageSize] = useState(options.pageSize);

  const query = useQuery({
    queryKey: [tableName, 'paginated', page, pageSize],
    queryFn: async () => {
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;

      const { data, error, count } = await (supabase
        .from(tableName as any)
        .select('*', { count: 'exact' })
        .range(start, end)
        .order('created_at', { ascending: false }) as any);

      if (error) throw error;

      const total = count || 0;
      const totalPages = Math.ceil(total / pageSize);

      return {
        data: data as T[],
        total,
        page,
        pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    },
    ...queryOptions,
  });

  const queryData = query.data as PaginatedResult<T> | undefined;

  const nextPage = () => {
    if (queryData?.hasNextPage) {
      setPage((prev) => prev + 1);
    }
  };

  const previousPage = () => {
    if (queryData?.hasPreviousPage) {
      setPage((prev) => prev - 1);
    }
  };

  const handleSetPageSize = (size: number) => {
    setPageSize(size);
    setPage(1); // Reset to first page when changing page size
  };

  return {
    data: queryData?.data ?? null,
    total: queryData?.total ?? 0,
    page: queryData?.page ?? page,
    pageSize: queryData?.pageSize ?? pageSize,
    totalPages: queryData?.totalPages ?? 0,
    hasNextPage: queryData?.hasNextPage ?? false,
    hasPreviousPage: queryData?.hasPreviousPage ?? false,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    setPage,
    setPageSize: handleSetPageSize,
    nextPage,
    previousPage,
    refetch: query.refetch,
  };
}

// Advanced version with filters and sorting
interface AdvancedPaginationOptions<T> extends PaginationOptions {
  filters?: Record<string, any>;
  sortBy?: keyof T;
  sortOrder?: 'asc' | 'desc';
}

export function usePaginatedQueryWithFilters<T = any>(
  tableName: string,
  options: AdvancedPaginationOptions<T>,
  queryBuilder?: (query: any) => any
): UsePaginatedQueryResult<T> {
  const [page, setPage] = useState(options.defaultPage || 1);
  const [pageSize, setPageSize] = useState(options.pageSize);

  const query = useQuery({
    queryKey: [tableName, 'paginated', page, pageSize, options.filters, options.sortBy, options.sortOrder],
    queryFn: async () => {
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;

      let queryChain = supabase
        .from(tableName as any)
        .select('*', { count: 'exact' })
        .range(start, end) as any;

      // Apply custom query builder if provided
      if (queryBuilder) {
        queryChain = queryBuilder(queryChain);
      }

      // Apply filters
      if (options.filters) {
        Object.entries(options.filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            queryChain = queryChain.eq(key, value);
          }
        });
      }

      // Apply sorting
      if (options.sortBy) {
        queryChain = queryChain.order(
          options.sortBy as string,
          { ascending: options.sortOrder === 'asc' }
        );
      } else {
        queryChain = queryChain.order('created_at', { ascending: false });
      }

      const { data, error, count } = await queryChain;

      if (error) throw error;

      const total = count || 0;
      const totalPages = Math.ceil(total / pageSize);

      return {
        data: data as T[],
        total,
        page,
        pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    },
  });

  const queryData = query.data as PaginatedResult<T> | undefined;

  const nextPage = () => {
    if (queryData?.hasNextPage) {
      setPage((prev) => prev + 1);
    }
  };

  const previousPage = () => {
    if (queryData?.hasPreviousPage) {
      setPage((prev) => prev - 1);
    }
  };

  const handleSetPageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  return {
    data: queryData?.data ?? null,
    total: queryData?.total ?? 0,
    page: queryData?.page ?? page,
    pageSize: queryData?.pageSize ?? pageSize,
    totalPages: queryData?.totalPages ?? 0,
    hasNextPage: queryData?.hasNextPage ?? false,
    hasPreviousPage: queryData?.hasPreviousPage ?? false,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    setPage,
    setPageSize: handleSetPageSize,
    nextPage,
    previousPage,
    refetch: query.refetch,
  };
}
