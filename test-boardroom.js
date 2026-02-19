import fs from 'fs';

async function run() {
    const graph = {
        id: "test-boardroom-" + Date.now(),
        name: "Boardroom Test",
        nodes: [
            {
                id: "node-input",
                type: "input",
                position: { x: 0, y: 0 },
                data: { type: "input", label: "Input", prompt: "Plan a successful marketing campaign for a futuristic robotic vacuum cleaner." }
            },
            {
                id: "node-planner",
                type: "agent",
                position: { x: 0, y: 0 },
                data: { type: "agent", label: "Planner", agentId: "main", role: "planner", status: "idle", output: "" }
            },
            {
                id: "node-critic",
                type: "agent",
                position: { x: 0, y: 0 },
                data: { type: "agent", label: "Critic", agentId: "main", role: "critic", status: "idle", output: "" }
            },
            {
                id: "node-merge",
                type: "merge",
                position: { x: 0, y: 0 },
                data: { type: "merge", label: "Consensus", mode: "consensus", status: "idle", output: "" }
            },
            {
                id: "node-judge",
                type: "judge",
                position: { x: 0, y: 0 },
                data: { type: "judge", label: "Judge", criteria: "1. Is the plan realistic? 2. Is there a clear target audience?", status: "idle", output: "" }
            },
            {
                id: "node-output",
                type: "output",
                position: { x: 0, y: 0 },
                data: { type: "output", label: "Final Output", output: "" }
            }
        ],
        edges: [
            { id: "e1", source: "node-input", target: "node-planner" },
            { id: "e2", source: "node-input", target: "node-critic" },
            { id: "e3", source: "node-planner", target: "node-merge" },
            { id: "e4", source: "node-critic", target: "node-merge" },
            { id: "e5", source: "node-merge", target: "node-judge" },
            { id: "e6", source: "node-judge", target: "node-output" }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    try {
        console.log("Starting run...");
        const res = await fetch('http://localhost:3001/api/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ graph })
        });

        if (!res.ok) {
            throw new Error(`Failed to start run: ${res.statusText}`);
        }

        const { runId } = await res.json();
        console.log(`Run started with ID: ${runId}`);

        // Fetch the events stream
        const eventsRes = await fetch(`http://localhost:3001/api/run/${runId}/events`);

        if (!eventsRes.body) {
            throw new Error("No response body");
        }

        const reader = eventsRes.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    if (dataStr === '[DONE]') {
                        console.log("\n--- STREAM FINISHED ---");
                        return;
                    }
                    try {
                        const event = JSON.parse(dataStr);
                        if (event.type === 'nodeFinal') {
                            console.log(`\n============== NODE FINAL: ${event.nodeId} ==============`);
                            console.log(event.data);
                            console.log(`========================================================\n`);
                        } else if (event.type === 'runCompleted') {
                            console.log("Run completed successfully!");
                            process.exit(0);
                        } else if (event.type === 'runError') {
                            console.error("Run failed:", event.error);
                            process.exit(1);
                        }
                    } catch (e) { }
                }
            }
        }
    } catch (err) {
        console.error("Error:", err);
    }
}

run();
