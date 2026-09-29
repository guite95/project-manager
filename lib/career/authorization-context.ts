import {AsyncLocalStorage} from 'node:async_hooks';
import type {CareerActor} from './auth.ts';

// Carry revocation state into deferred Jev attempts and the locked save transaction.
export const careerAuthorization=new AsyncLocalStorage<CareerActor>();
