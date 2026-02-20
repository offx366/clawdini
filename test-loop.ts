import { randomUUID } from 'crypto';

const GATEWAY_URL = 'http://localhost:3000';

const inputId = randomUUID();
const templateId = randomUUID();
const agentId = randomUUID();
const judgeId = randomUUID();
const switchId = randomUUID();
const outputId = randomUUID();
const stateId = randomUUID();
const failedOutputId = randomUUID();

// Minimal mock graph for a Draft Improvement Loop
const graph = {
    id: randomUUID(),
    name: 'Review Loop',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: [
        {
            id: inputId,
            type: 'input',
            position: { x: 0, y: 0 },
            data: { type: 'input', label: 'Topic Input', prompt: 'Explain quantum computing simply.' }
        },
        {
            id: stateId,
            type: 'state',
            position: { x: 0, y: 100 },
            data: { type: 'state', label: 'Feedback DB', namespace: 'feedback', mode: 'append' } // Dummy state just to test execution
        },
        {
            id: templateId,
            type: 'template',
            position: { x: 0, y: 200 },
            data: {
                type: 'template',
                label: 'Prompt Builder',
                format: 'text',
                template: 'Topic: {{TopicInput.text}}\\nHistory: {{state.feedback}}'
            }
        },
        {
            id: agentId,
            type: 'agent',
            position: { x: 0, y: 300 },
            data: { type: 'agent', label: 'Writer', agentId: 'test-agent' }
        },
        {
            id: judgeId,
            type: 'judge',
            position: { x: 0, y: 400 },
            data: {
                type: 'judge',
                label: 'Reviewer',
                criteria: 'Is it simple enough for a 5-year old?',
                passScore: 80
            }
        },
        {
            id: switchId,
            type: 'switch',
            position: { x: 0, y: 500 },
            data: {
                type: 'switch',
                label: 'Router',
                rules: [
                    { id: randomUUID(), mode: 'fieldMatch', condition: 'status', valueMatch: 'done' },
                    { id: randomUUID(), mode: 'fieldMatch', condition: 'status', valueMatch: 'human_review' }
                ]
            }
        },
        {
            id: outputId,
            type: 'output',
            position: { x: -100, y: 600 },
            data: { type: 'output', label: 'Done Output' }
        },
        {
            id: failedOutputId,
            type: 'output',
            position: { x: 100, y: 600 },
            data: { type: 'output', label: 'Needs Review' }
        }
    ],
    edges: [
        { id: randomUUID(), source: inputId, target: templateId },
        { id: randomUUID(), source: templateId, target: agentId },
        { id: randomUUID(), source: agentId, target: judgeId },
        { id: randomUUID(), source: judgeId, target: switchId },
        // Route 1 => Done Output
        { id: randomUUID(), source: switchId, sourceHandle: undefined, target: outputId },
        // Route 2 => Needs Review
        { id: randomUUID(), source: switchId, sourceHandle: undefined, target: failedOutputId },
        // Also feed Judge to State (just to exercise State node)
        { id: randomUUID(), source: judgeId, target: stateId }
    ]
};

// Fix the dynamic handle IDs
const doneRuleId = (graph.nodes.find((n: any) => n.type === 'switch') as any).data.rules[0].id;
const failRuleId = (graph.nodes.find((n: any) => n.type === 'switch') as any).data.rules[1].id;
(graph.edges[4] as any).sourceHandle = doneRuleId;
(graph.edges[5] as any).sourceHandle = failRuleId;

async function runTest() {
    console.log('Sending graph to server for execution...');
    try {
        const res = await fetch(GATEWAY_URL + '/api/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ graph })
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Failed to start run:', err);
            return;
        }

        const { runId } = await res.json() as any;
        console.log('Run started with ID:', runId);

    } catch (err) {
        console.error('Error connecting to server:', err);
    }
}

runTest();
