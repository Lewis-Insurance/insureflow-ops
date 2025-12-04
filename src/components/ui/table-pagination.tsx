import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { generatePageNumbers, type UsePaginationResult } from '@/hooks/usePagination';

interface TablePaginationProps {
  pagination: UsePaginationResult;
  pageSizeOptions?: number[];
  showPageSize?: boolean;
  showInfo?: boolean;
}

export function TablePagination({
  pagination,
  pageSizeOptions = [10, 25, 50, 100],
  showPageSize = true,
  showInfo = true,
}: TablePaginationProps) {
  const {
    page,
    pageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    hasNextPage,
    hasPreviousPage,
    setPage,
    setPageSize,
    previousPage,
    nextPage,
  } = pagination;

  const pageNumbers = generatePageNumbers(page, totalPages, 7);

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t pt-4">
      {/* Left side - Info and page size selector */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        {showInfo && (
          <div className="text-sm text-muted-foreground">
            Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
            <span className="font-medium">{endIndex}</span> of{' '}
            <span className="font-medium">{totalItems}</span> results
          </div>
        )}

        {showPageSize && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page:</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => setPageSize(Number(value))}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Right side - Pagination controls */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={previousPage}
                className={
                  !hasPreviousPage
                    ? 'pointer-events-none opacity-50'
                    : 'cursor-pointer'
                }
              />
            </PaginationItem>

            {pageNumbers.map((pageNum, index) =>
              pageNum === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    onClick={() => setPage(pageNum)}
                    isActive={pageNum === page}
                    className="cursor-pointer"
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              )
            )}

            <PaginationItem>
              <PaginationNext
                onClick={nextPage}
                className={
                  !hasNextPage ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

/**
 * Simplified pagination component with just prev/next buttons
 */
export function SimplePagination({
  pagination,
  showInfo = true,
}: {
  pagination: UsePaginationResult;
  showInfo?: boolean;
}) {
  const {
    page,
    totalPages,
    startIndex,
    endIndex,
    totalItems,
    hasNextPage,
    hasPreviousPage,
    previousPage,
    nextPage,
  } = pagination;

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between border-t pt-4">
      {showInfo && (
        <div className="text-sm text-muted-foreground">
          Page <span className="font-medium">{page}</span> of{' '}
          <span className="font-medium">{totalPages}</span> ({startIndex + 1}-{endIndex} of{' '}
          {totalItems})
        </div>
      )}

      <div className="flex gap-2">
        <PaginationPrevious
          onClick={previousPage}
          className={
            !hasPreviousPage ? 'pointer-events-none opacity-50' : 'cursor-pointer'
          }
        />
        <PaginationNext
          onClick={nextPage}
          className={!hasNextPage ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
        />
      </div>
    </div>
  );
}
