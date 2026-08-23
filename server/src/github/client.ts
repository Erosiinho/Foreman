import { Octokit } from '@octokit/rest';

/** Mirrors kicker's IDb abstraction: repositories pull a typed raw client out rather than depend on Octokit directly. */
export default interface IGitHub {
    getClient<T>(): T;
}

export class OctokitGitHub implements IGitHub {
    private client: Octokit;

    constructor(token: string) {
        this.client = new Octokit({ auth: token });
    }

    getClient<T>(): T {
        return this.client as unknown as T;
    }
}
