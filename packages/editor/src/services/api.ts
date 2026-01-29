import type { InteractiveGraph } from '@ine/shared';

const API_URL = 'http://localhost:3001';

export const api = {
    async saveProject(graph: InteractiveGraph) {
        const response = await fetch(`${API_URL}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(graph)
        });

        if (!response.ok) {
            throw new Error('Erro ao salvar projeto');
        }

        return response.json();
    },

    async getProjects() {
        const response = await fetch(`${API_URL}/api/projects`);
        return response.json();
    },

    async getProject(id: string) {
        const response = await fetch(`${API_URL}/api/projects/${id}`);
        return response.json();
    }
};
