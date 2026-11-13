interface RetryConfig {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffFactor: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
};

/**
 * Retry com backoff exponencial
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
): Promise<T> {
    const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: Error;

    for (let attempt = 0; attempt < finalConfig.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            if (attempt < finalConfig.maxAttempts - 1) {
                const delay = Math.min(
                    finalConfig.baseDelay * Math.pow(finalConfig.backoffFactor, attempt),
                    finalConfig.maxDelay
                );


                await sleep(delay);
            }
        }
    }

    console.error(`❌ Todas as ${finalConfig.maxAttempts} tentativas falharam`);
    throw lastError!;
}

/**
 * Retry apenas para erros de rede
 */
export async function retryOnNetworkError<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3
): Promise<T> {
    return retryWithBackoff(fn, {
        maxAttempts,
        baseDelay: 500,
        maxDelay: 5000,
        backoffFactor: 2
    });
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry com timeout
 */
export async function retryWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    retryConfig?: Partial<RetryConfig>
): Promise<T> {
    return Promise.race([
        retryWithBackoff(fn, retryConfig),
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeoutMs)
        )
    ]);
}
