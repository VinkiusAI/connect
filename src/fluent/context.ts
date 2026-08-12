/** Shared runtime context threaded through the fluent layer. */
import type { HttpClient } from '../core/http';

export interface SdkContext {
  readonly http: HttpClient;
  readonly appId: string;
  readonly namespace: (connector: string, name: string) => string;
}
