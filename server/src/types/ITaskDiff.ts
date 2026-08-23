export interface IDiffFile {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    /** Omitted by GitHub for very large or binary files. */
    patch?: string;
}

export default interface ITaskDiff {
    prNumber: number;
    prUrl: string;
    additions: number;
    deletions: number;
    files: IDiffFile[];
}
