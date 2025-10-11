/**
 * Queue task interface with priority and metadata
 */
interface QueueTask<T> {
  id: string;
  task: () => Promise<T>;
  priority: number;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  metadata?: Record<string, any>;
}

/**
 * Task options for queue operations
 */
export interface TaskOptions {
  priority?: number;
  id?: string;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Enhanced Queue for COI generation with priority, retry, timeout, and event support
 */
export class COIQueue extends EventTarget {
  private concurrency: number;
  private running: number = 0;
  private completed: number = 0;
  private failed: number = 0;
  private queue: QueueTask<any>[] = [];
  private taskMap: Map<string, QueueTask<any>> = new Map();
  private isPaused: boolean = false;
  private startTime?: number;
  private abortController?: AbortController;

  constructor(concurrency: number = 3) {
    super();
    this.concurrency = concurrency;
    this.abortController = new AbortController();
  }

  /**
   * Add a COI generation task with advanced options
   */
  async addCOI<T>(
    task: () => Promise<T>,
    options: {
      certificateNumber: string;
      priority?: number;
      maxRetries?: number;
      timeout?: number;
      onProgress?: (progress: number) => void;
    }
  ): Promise<T> {
    const {
      certificateNumber,
      priority = 0,
      maxRetries = 2,
      timeout = 30000, // 30 seconds default
      onProgress,
    } = options;

    const id = `coi-${certificateNumber}-${Date.now()}`;

    return new Promise((resolve, reject) => {
      const queueTask: QueueTask<T> = {
        id,
        task: async () => {
          const retryableTask = this.makeRetryable(task, maxRetries, id);
          const timedTask = timeout > 0 
            ? () => this.withTimeout(retryableTask, timeout)
            : retryableTask;

          // Track progress if callback provided
          if (onProgress) {
            const progressInterval = setInterval(() => {
              const progress = this.getProgress();
              onProgress(progress.percentage);
            }, 100);

            try {
              const result = await timedTask();
              clearInterval(progressInterval);
              return result;
            } catch (error) {
              clearInterval(progressInterval);
              throw error;
            }
          }

          return timedTask();
        },
        priority,
        resolve,
        reject,
        metadata: { certificateNumber },
      };

      this.insertByPriority(queueTask);
      this.taskMap.set(id, queueTask);

      if (!this.startTime) {
        this.startTime = Date.now();
      }

      this.processQueue();
    });
  }

  /**
   * Add a generic task to the queue
   */
  async add<T>(task: () => Promise<T>, options: TaskOptions = {}): Promise<T> {
    const {
      priority = 0,
      id = crypto.randomUUID(),
      maxRetries = 0,
      timeout = 0,
    } = options;

    return new Promise((resolve, reject) => {
      const queueTask: QueueTask<T> = {
        id,
        task: async () => {
          const retryableTask = this.makeRetryable(task, maxRetries, id);
          const timedTask = timeout > 0 
            ? () => this.withTimeout(retryableTask, timeout)
            : retryableTask;

          return timedTask();
        },
        priority,
        resolve,
        reject,
      };

      this.insertByPriority(queueTask);
      this.taskMap.set(id, queueTask);
      this.processQueue();
    });
  }

  /**
   * Add multiple tasks to the queue
   */
  async addAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(tasks.map(task => this.add(task)));
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    this.isPaused = true;
    this.dispatchEvent(new CustomEvent('paused'));
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    this.isPaused = false;
    this.dispatchEvent(new CustomEvent('resumed'));
    this.processQueue();
  }

  /**
   * Cancel all tasks and clear queue
   */
  cancel(): void {
    this.abortController?.abort();
    
    // Reject all pending tasks
    this.queue.forEach(task => {
      task.reject(new Error('Queue cancelled'));
    });
    
    this.clear();
    this.abortController = new AbortController();
    this.dispatchEvent(new CustomEvent('cancelled'));
  }

  /**
   * Remove a specific task from the queue
   */
  remove(taskId: string): boolean {
    const task = this.taskMap.get(taskId);
    if (!task) return false;

    const index = this.queue.indexOf(task);
    if (index > -1) {
      this.queue.splice(index, 1);
      this.taskMap.delete(taskId);
      task.reject(new Error('Task cancelled'));
      
      this.dispatchEvent(new CustomEvent('task:cancelled', {
        detail: { id: taskId }
      }));
      
      return true;
    }
    return false;
  }

  /**
   * Clear all pending tasks
   */
  clear(): void {
    this.queue = [];
    this.taskMap.clear();
  }

  /**
   * Get current queue status
   */
  getStatus() {
    return {
      running: this.running,
      pending: this.queue.length,
      total: this.running + this.queue.length,
    };
  }

  /**
   * Get detailed queue statistics
   */
  getStats() {
    const runtime = this.startTime 
      ? Date.now() - this.startTime 
      : 0;

    const throughput = this.completed > 0 
      ? (this.completed / (runtime / 1000)).toFixed(2)
      : '0';

    return {
      running: this.running,
      pending: this.queue.length,
      completed: this.completed,
      failed: this.failed,
      total: this.running + this.queue.length + this.completed,
      throughput: `${throughput} tasks/sec`,
      runtime: `${(runtime / 1000).toFixed(1)}s`,
      isPaused: this.isPaused,
      concurrency: this.concurrency,
    };
  }

  /**
   * Get progress percentage
   */
  getProgress() {
    const total = this.running + this.queue.length + this.completed;
    const percentage = total > 0 
      ? Math.round((this.completed / total) * 100)
      : 0;

    return {
      percentage,
      completed: this.completed,
      total,
      remaining: this.running + this.queue.length,
    };
  }

  /**
   * Adjust concurrency dynamically
   */
  setConcurrency(newConcurrency: number): void {
    this.concurrency = Math.max(1, newConcurrency);
    
    this.dispatchEvent(new CustomEvent('concurrency:changed', {
      detail: { concurrency: this.concurrency }
    }));
    
    if (!this.isPaused) {
      this.processQueue();
    }
  }

  /**
   * Reset queue to initial state
   */
  reset(): void {
    this.queue = [];
    this.taskMap.clear();
    this.running = 0;
    this.completed = 0;
    this.failed = 0;
    this.startTime = undefined;
    this.isPaused = false;

    this.dispatchEvent(new CustomEvent('reset'));
  }

  /**
   * Insert task by priority (higher priority = executed first)
   */
  private insertByPriority(task: QueueTask<any>): void {
    const index = this.queue.findIndex(item => item.priority < task.priority);
    if (index === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(index, 0, task);
    }
  }

  /**
   * Make a task retryable with exponential backoff
   */
  private makeRetryable<T>(
    task: () => Promise<T>,
    maxRetries: number,
    taskId: string
  ): () => Promise<T> {
    return async () => {
      let lastError: Error;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await task();
        } catch (error) {
          lastError = error as Error;

          if (attempt < maxRetries) {
            // Exponential backoff with max delay of 10 seconds
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            await new Promise(r => setTimeout(r, delay));

            this.dispatchEvent(new CustomEvent('task:retry', {
              detail: { 
                id: taskId,
                attempt: attempt + 1, 
                maxRetries, 
                error: lastError,
                nextDelay: delay,
              }
            }));
          }
        }
      }

      throw lastError!;
    };
  }

  /**
   * Add timeout wrapper to a task
   */
  private async withTimeout<T>(
    task: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Task timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([task(), timeout]);
  }

  /**
   * Process the queue based on concurrency limit
   */
  private async processQueue(): Promise<void> {
    if (this.isPaused || this.abortController?.signal.aborted) {
      return;
    }

    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      this.running++;
      this.taskMap.delete(task.id);

      this.executeTask(task);
    }

    // Emit progress event
    this.dispatchEvent(new CustomEvent('progress', {
      detail: this.getProgress()
    }));
  }

  /**
   * Execute a single task
   */
  private async executeTask(queueTask: QueueTask<any>): Promise<void> {
    const startTime = Date.now();

    this.dispatchEvent(new CustomEvent('task:start', {
      detail: { id: queueTask.id, metadata: queueTask.metadata }
    }));

    try {
      const result = await queueTask.task();
      this.completed++;

      this.dispatchEvent(new CustomEvent('task:complete', {
        detail: {
          id: queueTask.id,
          result,
          duration: Date.now() - startTime,
          metadata: queueTask.metadata,
        }
      }));

      queueTask.resolve(result);
    } catch (error) {
      this.failed++;

      this.dispatchEvent(new CustomEvent('task:error', {
        detail: {
          id: queueTask.id,
          error,
          duration: Date.now() - startTime,
          metadata: queueTask.metadata,
        }
      }));

      queueTask.reject(error);
    } finally {
      this.running--;

      if (this.running === 0 && this.queue.length === 0) {
        this.dispatchEvent(new CustomEvent('queue:empty', {
          detail: this.getStats()
        }));
      }

      this.processQueue();
    }
  }
}

/**
 * Simple async queue for basic operations (backward compatibility)
 */
export class Queue {
  private coiQueue: COIQueue;

  constructor(concurrency: number = 1) {
    this.coiQueue = new COIQueue(concurrency);
  }

  async add<T>(task: () => Promise<T>): Promise<T> {
    return this.coiQueue.add(task);
  }

  async addAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    return this.coiQueue.addAll(tasks);
  }

  getStatus() {
    return this.coiQueue.getStatus();
  }

  clear(): void {
    this.coiQueue.clear();
  }
}
