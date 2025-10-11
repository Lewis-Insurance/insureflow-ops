/**
 * Simple async queue for managing concurrent operations
 */
export class Queue {
  private concurrency: number;
  private running: number = 0;
  private queue: Array<() => Promise<any>> = [];

  constructor(concurrency: number = 1) {
    this.concurrency = concurrency;
  }

  /**
   * Add a single task to the queue
   */
  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          this.processQueue();
        }
      };

      this.queue.push(wrappedTask);
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
   * Process the queue based on concurrency limit
   */
  private processQueue(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        this.running++;
        task();
      }
    }
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
   * Clear all pending tasks
   */
  clear(): void {
    this.queue = [];
  }
}
