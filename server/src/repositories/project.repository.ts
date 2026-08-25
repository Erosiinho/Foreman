import { Octokit } from '@octokit/rest';
import IGitHub from '../github/client';
import TtlCache from '../lib/ttl-cache';

export interface IRepoSummary {
    owner: string;
    repo: string;
    fullName: string;
    private: boolean;
    url: string;
}

const CACHE_KEY = 'repos';

export default class ProjectRepository {
    private cache: TtlCache<IRepoSummary[]>;

    /** cacheTtlMs: kept in sync with the poller interval by the caller (see server.ts) — the poller's
     *  own next tick always outlives the cache, so it never misses a newly created/relabeled repo. */
    constructor(
        private github: IGitHub,
        cacheTtlMs: number,
    ) {
        this.cache = new TtlCache(cacheTtlMs);
    }

    private get client(): Octokit {
        return this.github.getClient<Octokit>();
    }

    /** Repos the GITHUB_TOKEN can see — "list your GitHub projects". Shared cache: the HTTP
     *  endpoint and the background poller both call this and reuse whichever fetched first. */
    async list(): Promise<IRepoSummary[]> {
        return this.cache.get(CACHE_KEY, () => this.fetchList());
    }

    private async fetchList(): Promise<IRepoSummary[]> {
        const repos = await this.client.paginate(this.client.rest.repos.listForAuthenticatedUser, {
            affiliation: 'owner',
            sort: 'updated',
            per_page: 100,
        });
        return repos.map((repo) => ({
            owner: repo.owner.login,
            repo: repo.name,
            fullName: repo.full_name,
            private: repo.private,
            url: repo.html_url,
        }));
    }
}
