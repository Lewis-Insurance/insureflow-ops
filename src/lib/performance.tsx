import React, { useMemo, useCallback, memo } from 'react';

/**
 * Performance utilities for optimizing React components
 */

// Memoization helpers
export const memoize = <T extends (...args: any[]) => any>(fn: T): T => {
  const cache = new Map();
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
};

// Stable callback hook with dependency optimization
export const useStableCallback = <T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T => {
  return useCallback(callback, deps);
};

// Memoized computation hook
export const useStableMemo = <T,>(
  factory: () => T,
  deps: React.DependencyList
): T => {
  return useMemo(factory, deps);
};

// Higher-order component for deep memo comparison
export const withDeepMemo = <P extends object>(
  Component: React.ComponentType<P>,
  isEqual?: (prevProps: P, nextProps: P) => boolean
) => {
  const MemoizedComponent = memo(Component, isEqual);
  MemoizedComponent.displayName = `withDeepMemo(${Component.displayName || Component.name})`;
  return MemoizedComponent;
};

// Performance monitoring hook
export const usePerformanceMonitor = (componentName: string) => {
  const renderStart = performance.now();
  
  React.useEffect(() => {
    const renderEnd = performance.now();
    const renderTime = renderEnd - renderStart;
    
    if (renderTime > 16) { // More than one frame (16ms)
      console.warn(`[Performance] ${componentName} took ${renderTime.toFixed(2)}ms to render`);
    }
  });
};

// Virtual scrolling utilities
export const calculateVisibleRange = (
  containerHeight: number,
  itemHeight: number,
  scrollTop: number,
  overscan = 5
) => {
  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleEnd = Math.min(
    visibleStart + Math.ceil(containerHeight / itemHeight),
    Number.MAX_SAFE_INTEGER
  );
  
  return {
    start: Math.max(0, visibleStart - overscan),
    end: visibleEnd + overscan,
  };
};

// Optimized list rendering for large datasets
export interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string | number;
  overscan?: number;
}

export const VirtualizedList = <T,>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  keyExtractor,
  overscan = 5,
}: VirtualizedListProps<T>) => {
  const [scrollTop, setScrollTop] = React.useState(0);
  
  const { start, end } = useMemo(
    () => calculateVisibleRange(containerHeight, itemHeight, scrollTop, overscan),
    [containerHeight, itemHeight, scrollTop, overscan]
  );
  
  const visibleItems = useMemo(
    () => items.slice(start, end),
    [items, start, end]
  );
  
  const totalHeight = items.length * itemHeight;
  const offsetY = start * itemHeight;
  
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);
  
  return (
    <div
      style={{ height: containerHeight, overflow: 'auto' }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => (
            <div
              key={keyExtractor(item, start + index)}
              style={{ height: itemHeight }}
            >
              {renderItem(item, start + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Intersection observer hook for lazy loading
export const useIntersectionObserver = (
  ref: React.RefObject<Element>,
  options: IntersectionObserverInit = {}
) => {
  const [isIntersecting, setIsIntersecting] = React.useState(false);
  
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);
    
    observer.observe(element);
    
    return () => observer.disconnect();
  }, [ref, options]);
  
  return isIntersecting;
};

// Throttled scroll hook
export const useThrottledScroll = (callback: () => void, delay = 16) => {
  const lastRun = React.useRef(Date.now());
  
  const throttledCallback = useCallback(() => {
    if (Date.now() - lastRun.current >= delay) {
      callback();
      lastRun.current = Date.now();
    }
  }, [callback, delay]);
  
  return throttledCallback;
};

// Memory usage monitor (development only)
export const useMemoryMonitor = (componentName: string) => {
  React.useEffect(() => {
    if (import.meta.env.DEV && 'memory' in performance) {
      const logMemory = () => {
        const memory = (performance as any).memory;
        console.log(`[Memory] ${componentName}:`, {
          used: Math.round(memory.usedJSHeapSize / 1048576),
          allocated: Math.round(memory.totalJSHeapSize / 1048576),
          limit: Math.round(memory.jsHeapSizeLimit / 1048576),
        });
      };
      
      logMemory();
      
      // Only log memory in development to avoid performance impact in production
      if (import.meta.env.DEV) {
        const interval = setInterval(logMemory, 10000); // Reduce frequency to 10 seconds
        return () => clearInterval(interval);
      }
    }
  }, [componentName]);
};