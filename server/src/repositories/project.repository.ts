import { Octokit } from '@octokit/rest';
import IGitHub from '../github/client';

export interface IRepoSummary {
    owner: string;
    repo: string;
    fullName: string;
    private: boolean;
    url: string;
}

export default class ProjectRepository {
    constructor(private github: IGitHub) {}

    private get client(): Octokit {
        return this.github.getClient<Octokit>();
    }

    /** Repos the GITHUB_TOKEN can see — "list your GitHub projects". */
    async list(): Promise<IRepoSummary[]> {
        const repos = await this.client.paginate(this.client.rest.repos.listForAuthenticatedUser, {
            affiliation: 'owner,collaborator,organization_member',
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
