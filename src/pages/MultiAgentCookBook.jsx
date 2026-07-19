import { useState } from "react";

const FRAMEWORKS = [
  {
    id: "swarm-handoff",
    category: "Swarm",
    title: "Agent Handoffs with Swarm",
    difficulty: "Beginner",
    time: "~20 min",
    description: "Use OpenAI Swarm-style handoffs to transfer control between specialized agents mid-conversation. Each agent owns a domain and passes the baton when out of scope.",
    tags: ["swarm", "handoff", "routing"],
    steps: [
      { label: "Define Agents", icon: "🤖", detail: "Create agents with a name, system prompt, and tool list. Each agent is a specialist — keep system prompts tightly scoped to one domain (billing, support, sales)." },
      { label: "Handoff Tool", icon: "🔀", detail: "Give each agent a transfer_to_X tool for every agent it may hand off to. The tool returns the target agent object — the loop detects this and switches context." },
      { label: "Run Loop", icon: "🔄", detail: "The orchestration loop calls the active agent, checks if a tool result is an Agent object, and if so switches the active agent for the next turn." },
      { label: "Preserve History", icon: "📚", detail: "Pass the full conversation history to every agent on every turn. Agents can read what happened before the handoff to avoid asking the user to repeat themselves." },
      { label: "Context Variables", icon: "📦", detail: "Maintain a shared context_variables dict passed to every tool call. Agents read and write to it — e.g. storing account_id so downstream agents don't re-fetch it." },
    ],
    code: `import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic();

// ── Agent definitions ─────────────────────────────────────────────────────────

const triageAgent = {
  name: "Triage Agent",
  system: "You are a triage agent. Determine if the user needs billing help or technical support, then hand off to the right agent. Do not answer questions yourself.",
  tools: ["transfer_to_billing", "transfer_to_support"],
};

const billingAgent = {
  name: "Billing Agent",
  system: "You are a billing specialist. Help with invoices, payments, and subscription changes. Transfer back to triage if the issue is technical.",
  tools: ["get_invoice", "process_refund", "transfer_to_triage"],
};

const supportAgent = {
  name: "Support Agent",
  system: "You are a technical support specialist. Debug issues, check system status, and escalate if needed. Transfer to billing for payment questions.",
  tools: ["check_system_status", "create_ticket", "transfer_to_billing"],
};

const AGENT_MAP = {
  triage: triageAgent,
  billing: billingAgent,
  support: supportAgent,
};

// Tool implementations
const toolHandlers = {
  transfer_to_billing: () => ({ __handoff__: "billing", message: "Transferring to billing..." }),
  transfer_to_support: () => ({ __handoff__: "support", message: "Transferring to support..." }),
  transfer_to_triage:  () => ({ __handoff__: "triage",  message: "Transferring back to triage..." }),
  get_invoice: ({ invoice_id }) => ({ invoice_id, amount: "$49.00", status: "paid", date: "2024-01-15" }),
  process_refund: ({ invoice_id }) => ({ success: true, refund_id: "ref_" + invoice_id }),
  check_system_status: () => ({ status: "operational", latency_ms: 42 }),
  create_ticket: ({ description }) => ({ ticket_id: "TKT-1042", description, priority: "medium" }),
};

function buildTools(agent) {
  return agent.tools.map((name) => ({
    name,
    description: name.replace(/_/g, " "),
    input_schema: { type: "object", properties: {}, additionalProperties: true },
  }));
}

// ── Swarm loop ────────────────────────────────────────────────────────────────

async function runSwarm(userMessage, startAgent = "triage") {
  let activeAgent = AGENT_MAP[startAgent];
  const messages = [{ role: "user", content: userMessage }];
  const contextVariables = {};

  console.log(\`Starting with: \${activeAgent.name}\`);

  for (let turn = 0; turn < 10; turn++) {
    const response = await claude.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      system: activeAgent.system,
      tools: buildTools(activeAgent),
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      const text = response.content.find((b) => b.type === "text")?.text;
      console.log(\`[\${activeAgent.name}]: \${text}\`);
      return { text, agent: activeAgent.name, contextVariables };
    }

    // Process tool calls
    const toolResults = [];
    let handoffTarget = null;

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const handler = toolHandlers[block.name];
      const result = handler ? handler({ ...block.input, ...contextVariables }) : { error: "Unknown tool" };

      // Detect handoff
      if (result.__handoff__) {
        handoffTarget = result.__handoff__;
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result.message });
      } else {
        // Store useful values in shared context
        Object.assign(contextVariables, result);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      }
    }

    messages.push({ role: "user", content: toolResults });

    if (handoffTarget) {
      activeAgent = AGENT_MAP[handoffTarget];
      console.log(\`→ Handed off to: \${activeAgent.name}\`);
    }
  }

  return { text: "Max turns reached", agent: activeAgent.name };
}

const result = await runSwarm("I was charged twice last month and need a refund.");
console.log("Final answer:", result.text);`,
  },
  {
    id: "langgraph-state",
    category: "LangGraph",
    title: "Stateful Graph with LangGraph",
    difficulty: "Intermediate",
    time: "~35 min",
    description: "Model your agent workflow as a directed graph where nodes are functions and edges are conditional transitions. State flows through the graph, accumulating results at each node.",
    tags: ["LangGraph", "state graph", "conditional edges"],
    steps: [
      { label: "Define State", icon: "📋", detail: "Declare a TypeScript interface (or Zod schema) for the shared state object. Every node reads from and writes to this state — it's the single source of truth across the graph." },
      { label: "Create Nodes", icon: "🔵", detail: "Each node is an async function that receives the current state and returns a partial state update. Nodes should do one thing: call an LLM, invoke a tool, or make a decision." },
      { label: "Add Edges", icon: "➡️", detail: "Static edges always proceed to the next node. Conditional edges call a router function that inspects state and returns the name of the next node — this is how branching logic works." },
      { label: "Checkpointing", icon: "💾", detail: "Attach a checkpointer (e.g. MemorySaver or SqliteSaver) to persist state after each node. This enables pause/resume, time-travel debugging, and human-in-the-loop interrupts." },
      { label: "Compile & Run", icon: "▶️", detail: "Call graph.compile() to validate the graph structure (no orphan nodes, no missing edges). Then invoke with an initial state and a thread config for session isolation." },
    ],
    code: `import { Anthropic } from "@anthropic-ai/sdk";
import { StateGraph, END, START } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";

const claude = new Anthropic();

// ── State definition ──────────────────────────────────────────────────────────

const graphState = {
  messages: { reducer: (a, b) => [...a, ...b], default: () => [] },
  retrievedDocs: { reducer: (_, b) => b, default: () => [] },
  draftAnswer: { reducer: (_, b) => b, default: () => "" },
  needsRetrieval: { reducer: (_, b) => b, default: () => true },
  iterations: { reducer: (a, b) => a + b, default: () => 0 },
};

// ── Nodes ─────────────────────────────────────────────────────────────────────

async function routerNode(state) {
  const lastMessage = state.messages.at(-1)?.content ?? "";
  const res = await claude.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 50,
    messages: [{ role: "user", content: \`Does answering this question require looking up documents?
Question: \${lastMessage}
Reply with exactly: YES or NO\` }],
  });
  const needsRetrieval = res.content[0].text.trim().toUpperCase() === "YES";
  return { needsRetrieval };
}

async function retrievalNode(state) {
  // Simulate vector DB retrieval
  const query = state.messages.at(-1)?.content ?? "";
  const mockDocs = [
    \`Document 1: Relevant info about "\${query.slice(0, 30)}..."\`,
    \`Document 2: Additional context for the query.\`,
  ];
  return { retrievedDocs: mockDocs };
}

async function generationNode(state) {
  const context = state.retrievedDocs.join("\\n\\n");
  const question = state.messages.at(-1)?.content ?? "";

  const res = await claude.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: context
        ? \`Context:\\n\${context}\\n\\nQuestion: \${question}\`
        : question,
    }],
  });

  return {
    draftAnswer: res.content[0].text,
    messages: [{ role: "assistant", content: res.content[0].text }],
    iterations: 1,
  };
}

async function graderNode(state) {
  const res = await claude.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 50,
    messages: [{
      role: "user",
      content: \`Is this answer grounded in the provided documents and free of hallucinations?
Answer: \${state.draftAnswer}
Reply with: PASS or FAIL\`,
    }],
  });
  const passed = res.content[0].text.includes("PASS");
  // If failed and < 3 iterations, loop back to retrieval
  return { needsRetrieval: !passed && state.iterations < 3 };
}

// ── Graph assembly ────────────────────────────────────────────────────────────

const workflow = new StateGraph({ channels: graphState });

workflow
  .addNode("router", routerNode)
  .addNode("retrieve", retrievalNode)
  .addNode("generate", generationNode)
  .addNode("grade", graderNode)
  .addEdge(START, "router")
  .addConditionalEdges("router", (state) => state.needsRetrieval ? "retrieve" : "generate")
  .addEdge("retrieve", "generate")
  .addEdge("generate", "grade")
  .addConditionalEdges("grade", (state) => state.needsRetrieval ? "retrieve" : END);

const checkpointer = new MemorySaver();
const graph = workflow.compile({ checkpointer });

// ── Run ───────────────────────────────────────────────────────────────────────

const threadConfig = { configurable: { thread_id: "session-42" } };
const result = await graph.invoke(
  { messages: [{ role: "user", content: "What were the Q3 revenue results?" }] },
  threadConfig
);

console.log("Final answer:", result.draftAnswer);
console.log("Iterations:", result.iterations);`,
  },
  {
    id: "crewai-roles",
    category: "CrewAI",
    title: "Role-Based Crews",
    difficulty: "Intermediate",
    time: "~30 min",
    description: "Assemble a crew of role-playing agents, each with a goal and backstory. Tasks flow sequentially or in parallel through the crew, with each agent contributing its specialty.",
    tags: ["CrewAI", "roles", "tasks", "process"],
    steps: [
      { label: "Define Roles", icon: "🎭", detail: "Create Agent objects with role, goal, and backstory. The backstory shapes how the LLM interprets its persona — be specific and concrete, not generic." },
      { label: "Assign Tools", icon: "🔧", detail: "Give each agent the tools it needs for its role. Agents only call tools relevant to their specialty — a researcher gets search, a writer gets none." },
      { label: "Create Tasks", icon: "📋", detail: "Tasks have a description, expected_output, and an assigned agent. The expected_output guides what format the agent should return — be explicit." },
      { label: "Pick a Process", icon: "⚙️", detail: "Process.sequential runs tasks one after another, passing each output as context to the next. Process.hierarchical adds a manager agent that delegates and reviews." },
      { label: "Kick Off Crew", icon: "🚀", detail: "Call crew.kickoff(inputs={...}) with any template variables used in task descriptions. Returns the final task's output as a string." },
    ],
    code: `from crewai import Agent, Task, Crew, Process
from crewai_tools import SerperDevTool, WebsiteSearchTool
from anthropic import Anthropic

# CrewAI supports custom LLMs — wire in Claude
import os
os.environ["OPENAI_API_KEY"] = "unused"  # CrewAI requires this env var
os.environ["OPENAI_MODEL_NAME"] = "claude-opus-4-6"

# ── Tools ─────────────────────────────────────────────────────────────────────

search_tool = SerperDevTool()
web_tool = WebsiteSearchTool()

# ── Agents ────────────────────────────────────────────────────────────────────

researcher = Agent(
    role="Senior Research Analyst",
    goal="Uncover cutting-edge developments in {topic} and identify key trends",
    backstory=(
        "You are a veteran analyst at a top-tier research firm. "
        "You are known for finding non-obvious insights and citing primary sources. "
        "You never speculate — every claim is backed by evidence."
    ),
    tools=[search_tool, web_tool],
    verbose=True,
    max_iter=5,
)

writer = Agent(
    role="Content Strategist",
    goal="Transform research findings into a compelling, structured report",
    backstory=(
        "You are an award-winning tech journalist who makes complex topics "
        "accessible without dumbing them down. You structure reports with "
        "clear headings, concrete examples, and a strong executive summary."
    ),
    tools=[],  # writer needs no external tools
    verbose=True,
)

editor = Agent(
    role="Editorial Director",
    goal="Ensure accuracy, clarity, and consistency before publication",
    backstory=(
        "You have 20 years of editorial experience. You fact-check every claim, "
        "cut filler ruthlessly, and ensure the report has a single clear narrative thread."
    ),
    tools=[search_tool],
    verbose=True,
)

# ── Tasks ─────────────────────────────────────────────────────────────────────

research_task = Task(
    description=(
        "Research the latest developments in {topic} from the past 6 months. "
        "Identify the top 5 trends, key players, and any emerging risks. "
        "Collect at least 3 primary source URLs."
    ),
    expected_output=(
        "A structured markdown document with: "
        "1) Executive summary (3 sentences), "
        "2) Top 5 trends with evidence, "
        "3) Key players table, "
        "4) Risk factors, "
        "5) Source URLs"
    ),
    agent=researcher,
)

writing_task = Task(
    description=(
        "Using the research findings, write a 800-word report on {topic} "
        "suitable for a C-suite audience. Lead with the most surprising insight."
    ),
    expected_output="An 800-word markdown report with H2 headings and a strong opening hook.",
    agent=writer,
    context=[research_task],  # receives researcher's output as context
)

editing_task = Task(
    description=(
        "Review the draft report for factual accuracy, clarity, and flow. "
        "Cross-check 2 key claims against sources. Return the polished final version."
    ),
    expected_output="The final, publication-ready report with any corrections noted in a changelog.",
    agent=editor,
    context=[writing_task],
)

# ── Crew ──────────────────────────────────────────────────────────────────────

crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, writing_task, editing_task],
    process=Process.sequential,
    verbose=2,
    memory=True,        # agents share a memory store across tasks
    embedder={          # used for memory similarity search
        "provider": "openai",
        "config": { "model": "text-embedding-3-small" }
    },
)

result = crew.kickoff(inputs={"topic": "AI agents in enterprise software"})
print(result)`,
  },
  {
    id: "autogen-conversation",
    category: "AutoGen",
    title: "Conversable Agents with AutoGen",
    difficulty: "Intermediate",
    time: "~25 min",
    description: "AutoGen's ConversableAgent lets agents chat with each other autonomously. A UserProxyAgent executes code; an AssistantAgent writes it. Together they solve tasks iteratively.",
    tags: ["AutoGen", "conversable", "code execution"],
    steps: [
      { label: "AssistantAgent", icon: "✍️", detail: "The AssistantAgent is backed by an LLM and writes code, plans, and responses. Configure it with a system message and llm_config pointing to your model." },
      { label: "UserProxyAgent", icon: "⚙️", detail: "The UserProxyAgent represents the human side and can execute code locally. Set human_input_mode to NEVER for full autonomy, or TERMINATE to stop on a keyword." },
      { label: "Code Execution", icon: "🖥️", detail: "UserProxyAgent extracts code blocks from AssistantAgent messages and runs them in a Docker sandbox or local subprocess. Results feed back into the conversation." },
      { label: "Termination", icon: "🛑", detail: "Define is_termination_msg to stop the conversation when the assistant signals completion (e.g. returns 'TERMINATE'). Without this, conversations loop indefinitely." },
      { label: "GroupChat", icon: "👥", detail: "For 3+ agents, use GroupChat + GroupChatManager. The manager decides which agent speaks next, enabling round-robin or LLM-selected speaker order." },
    ],
    code: `import autogen
from anthropic import Anthropic

# Configure AutoGen to use Claude
llm_config = {
    "config_list": [{
        "model": "claude-opus-4-6",
        "api_key": "your-anthropic-api-key",
        "api_type": "anthropic",
    }],
    "temperature": 0,
    "timeout": 120,
}

# ── Two-agent pattern: assistant + code executor ──────────────────────────────

assistant = autogen.AssistantAgent(
    name="Assistant",
    llm_config=llm_config,
    system_message=(
        "You are a helpful AI assistant. Solve tasks using Python code. "
        "When the task is complete, reply with TERMINATE."
    ),
)

user_proxy = autogen.UserProxyAgent(
    name="UserProxy",
    human_input_mode="NEVER",          # fully autonomous
    max_consecutive_auto_reply=10,
    is_termination_msg=lambda x: x.get("content", "").rstrip().endswith("TERMINATE"),
    code_execution_config={
        "work_dir": "coding_workspace",
        "use_docker": True,            # sandbox execution
    },
)

# Start a two-agent conversation
user_proxy.initiate_chat(
    assistant,
    message="Fetch the top 5 HackerNews stories right now and plot their scores as a bar chart. Save as hn_scores.png.",
)

# ── Group chat: 3 agents collaborate ─────────────────────────────────────────

planner = autogen.AssistantAgent(
    name="Planner",
    llm_config=llm_config,
    system_message="You are a project planner. Break tasks into steps and assign them to Coder or Reviewer.",
)

coder = autogen.AssistantAgent(
    name="Coder",
    llm_config=llm_config,
    system_message="You write clean, well-documented Python code. Only write code when asked by Planner.",
)

reviewer = autogen.AssistantAgent(
    name="Reviewer",
    llm_config=llm_config,
    system_message=(
        "You review code for bugs, security issues, and best practices. "
        "Approve with 'LGTM' or request changes with specific comments."
    ),
)

executor = autogen.UserProxyAgent(
    name="Executor",
    human_input_mode="NEVER",
    code_execution_config={"work_dir": "workspace", "use_docker": True},
    is_termination_msg=lambda x: "TERMINATE" in x.get("content", ""),
)

group_chat = autogen.GroupChat(
    agents=[planner, coder, reviewer, executor],
    messages=[],
    max_round=20,
    speaker_selection_method="auto",  # LLM picks next speaker
)

manager = autogen.GroupChatManager(groupchat=group_chat, llm_config=llm_config)

executor.initiate_chat(
    manager,
    message="Build a REST API endpoint in FastAPI that returns the Fibonacci sequence up to N terms.",
)`,
  },
  {
    id: "custom-orchestrator",
    category: "Custom",
    title: "Build Your Own Orchestrator",
    difficulty: "Advanced",
    time: "~50 min",
    description: "Skip the frameworks and build a lightweight multi-agent orchestrator from scratch. Full control over routing, state, retries, and observability.",
    tags: ["custom", "orchestration", "from scratch"],
    steps: [
      { label: "Agent Abstraction", icon: "🤖", detail: "Define a minimal Agent class: name, system prompt, tools, and an async run(messages) method. Keep it thin — the orchestrator handles routing, not the agent." },
      { label: "Message Bus", icon: "📨", detail: "Use a shared message list as the bus. Each agent appends its output as {role: assistant, name: agent_name, content: ...}. Downstream agents see the full history." },
      { label: "Router", icon: "🗺️", detail: "A router function inspects the last message and returns the name of the next agent. Can be rule-based (keyword match), LLM-based (ask Claude who should answer), or hybrid." },
      { label: "Retry & Timeout", icon: "🔁", detail: "Wrap each agent call in a retry loop with exponential backoff. Set per-agent timeouts so a slow agent doesn't block the entire pipeline." },
      { label: "Observability", icon: "📊", detail: "Emit structured logs for every agent invocation: agent name, token usage, latency, tool calls, and routing decisions. This is what makes multi-agent systems debuggable." },
      { label: "Human-in-the-Loop", icon: "👤", detail: "Before routing to high-stakes agents (e.g. one that executes code or sends emails), pause and require human approval. Store pending approvals in a queue the UI polls." },
    ],
    code: `import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

const claude = new Anthropic();

// ── Agent class ───────────────────────────────────────────────────────────────

class Agent {
  constructor({ name, system, tools = [], maxRetries = 3, timeoutMs = 30000 }) {
    this.name = name;
    this.system = system;
    this.tools = tools;
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
  }

  async run(messages, contextVars = {}) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await claude.messages.create({
          model: "claude-opus-4-6",
          max_tokens: 2048,
          system: this.system,
          tools: this.tools,
          messages,
        });

        clearTimeout(timer);
        return response;
      } catch (err) {
        if (attempt === this.maxRetries) throw err;
        const delay = Math.pow(2, attempt) * 500;
        console.warn(\`[\${this.name}] attempt \${attempt} failed, retrying in \${delay}ms: \${err.message}\`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
}

// ── Observability ─────────────────────────────────────────────────────────────

function logEvent(type, data) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), type, ...data }));
}

// ── LLM-based router ──────────────────────────────────────────────────────────

async function llmRouter(agents, messages, question) {
  const agentDescriptions = agents.map((a) => \`- \${a.name}: \${a.system.slice(0, 80)}\`).join("\\n");
  const res = await claude.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 50,
    messages: [{
      role: "user",
      content: \`Given this question, which agent should handle it?
Question: \${question}
Agents:\\n\${agentDescriptions}
Reply with ONLY the agent name, exactly as listed.\`,
    }],
  });
  return res.content[0].text.trim();
}

// ── Tool execution ────────────────────────────────────────────────────────────

const toolImpls = {
  web_search: ({ query }) => ({ results: [\`Mock result for: \${query}\`] }),
  calculator: ({ expr }) => ({ result: eval(expr) }), // eslint-disable-line no-eval
  send_email: ({ to, subject }) => {
    // High-stakes tool — requires human approval in production
    return { queued: true, to, subject, approval_id: randomUUID() };
  },
};

async function executeTools(blocks) {
  const results = [];
  for (const block of blocks) {
    if (block.type !== "tool_use") continue;
    const t0 = Date.now();
    const impl = toolImpls[block.name];
    const result = impl ? impl(block.input) : { error: "Unknown tool" };
    logEvent("tool_call", { tool: block.name, input: block.input, latency_ms: Date.now() - t0 });
    results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
  }
  return results;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

const agents = [
  new Agent({ name: "Researcher", system: "You find and summarize information. Use web_search for current data.", tools: [{ name: "web_search", description: "Search the web", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } }] }),
  new Agent({ name: "Analyst",    system: "You analyze data and compute metrics. Use calculator for math.",     tools: [{ name: "calculator", description: "Evaluate a math expression", input_schema: { type: "object", properties: { expr: { type: "string" } }, required: ["expr"] } }] }),
  new Agent({ name: "Writer",     system: "You write clear, structured reports based on research and analysis.", tools: [] }),
];

async function orchestrate(userMessage) {
  const sessionId = randomUUID();
  const messages = [{ role: "user", content: userMessage }];
  const contextVars = { sessionId };

  logEvent("session_start", { sessionId, query: userMessage });

  for (let turn = 0; turn < 8; turn++) {
    // Route to best agent
    const agentName = await llmRouter(agents, messages, messages.at(-1).content);
    const agent = agents.find((a) => a.name === agentName) ?? agents[0];

    logEvent("routing_decision", { turn, selected: agent.name });
    const t0 = Date.now();
    const response = await agent.run(messages, contextVars);
    logEvent("agent_response", {
      agent: agent.name, latency_ms: Date.now() - t0,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      const text = response.content.find((b) => b.type === "text")?.text;
      logEvent("session_end", { sessionId, turns: turn + 1 });
      return text;
    }

    // Execute tools and feed results back
    const toolResults = await executeTools(response.content);
    if (toolResults.length) messages.push({ role: "user", content: toolResults });
  }

  return "Max orchestration turns reached.";
}

const answer = await orchestrate("Research the latest GPU prices, calculate the price-per-TFLOP for the top 3, then write a buying guide.");
console.log(answer);`,
  },
  {
    id: "supervisor-pattern",
    category: "Custom",
    title: "Supervisor Pattern",
    difficulty: "Advanced",
    time: "~40 min",
    description: "A supervisor agent evaluates worker agent outputs, requests revisions, and gates progress — ensuring quality before results move to the next stage.",
    tags: ["supervisor", "quality gate", "revision loop"],
    steps: [
      { label: "Worker Agent", icon: "👷", detail: "Worker agents produce draft outputs: text, code, data, or plans. They should not self-evaluate — that's the supervisor's job. Keep workers focused on production." },
      { label: "Supervisor Agent", icon: "🎓", detail: "The supervisor receives the worker's output along with the original task. It scores quality and returns either APPROVE or REVISE with specific feedback." },
      { label: "Feedback Loop", icon: "🔄", detail: "If the supervisor returns REVISE, append the feedback as a new user message and re-invoke the worker. The worker sees its own prior output and the critique." },
      { label: "Max Rounds", icon: "🔢", detail: "Cap the revision loop at N rounds (typically 3). If the supervisor still rejects after max rounds, escalate to a human or return the best attempt with a warning." },
      { label: "Structured Eval", icon: "📊", detail: "Ask the supervisor to return a JSON scorecard: {score, approved, feedback, criteria}. Structured output makes it easy to log quality metrics over time." },
    ],
    code: `import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic();

// ── Worker agent ──────────────────────────────────────────────────────────────

async function workerAgent(task, previousDraft = null, feedback = null) {
  const messages = [{ role: "user", content: task }];

  if (previousDraft && feedback) {
    messages.push({ role: "assistant", content: previousDraft });
    messages.push({
      role: "user",
      content: \`Your previous response was reviewed. Please revise it based on this feedback:\\n\${feedback}\`,
    });
  }

  const response = await claude.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    system: "You are an expert writer and analyst. Produce thorough, accurate, well-structured outputs.",
    messages,
  });

  return response.content[0].text;
}

// ── Supervisor agent ──────────────────────────────────────────────────────────

async function supervisorAgent(task, draft) {
  const response = await claude.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 512,
    system: "You are a strict editorial supervisor. Evaluate outputs rigorously and request revisions when needed.",
    messages: [{
      role: "user",
      content: \`Evaluate this draft against the original task.

Task: \${task}

Draft:
\${draft}

Return ONLY a JSON object (no markdown):
{
  "score": <1-10>,
  "approved": <true|false>,
  "feedback": "<specific revision instructions if not approved, empty string if approved>",
  "criteria": {
    "accuracy": <1-10>,
    "completeness": <1-10>,
    "clarity": <1-10>,
    "structure": <1-10>
  }
}\`,
    }],
  });

  const text = response.content[0].text.replace(/\`\`\`json|\\n\`\`\`/g, "").trim();
  return JSON.parse(text);
}

// ── Supervisor loop ───────────────────────────────────────────────────────────

async function supervisedWorkflow(task, maxRounds = 3) {
  const history = [];
  let draft = null;

  for (let round = 1; round <= maxRounds; round++) {
    console.log(\`\\n── Round \${round} ────────────────────────────────\`);

    // Worker produces (or revises) the draft
    const feedback = history.at(-1)?.feedback ?? null;
    draft = await workerAgent(task, draft, feedback);
    console.log(\`Worker output (\${draft.length} chars)\`);

    // Supervisor evaluates
    const evaluation = await supervisorAgent(task, draft);
    history.push({ round, ...evaluation });

    console.log(\`Supervisor score: \${evaluation.score}/10 | Approved: \${evaluation.approved}\`);
    if (evaluation.criteria) {
      console.log(\`  Accuracy: \${evaluation.criteria.accuracy} | Completeness: \${evaluation.criteria.completeness} | Clarity: \${evaluation.criteria.clarity}\`);
    }

    if (evaluation.approved) {
      console.log(\`✓ Approved after \${round} round(s)\`);
      return { output: draft, history, approved: true, rounds: round };
    }

    console.log(\`Feedback: \${evaluation.feedback}\`);

    if (round === maxRounds) {
      console.warn(\`⚠ Max rounds reached — returning best attempt (score: \${evaluation.score})\`);
      return { output: draft, history, approved: false, rounds: round };
    }
  }
}

const result = await supervisedWorkflow(
  "Write a technical explanation of transformer attention mechanisms for senior engineers. Include a worked example with actual numbers."
);

console.log("\\n── Final Output ──────────────────────────────────");
console.log(result.output);
console.log(\`\\nApproved: \${result.approved} | Rounds: \${result.rounds}\`);`,
  },
  {
    id: "parallelization",
    category: "Patterns",
    title: "Parallel Agent Fan-Out",
    difficulty: "Intermediate",
    time: "~25 min",
    description: "Split a task into independent subtasks, run specialist agents on each in parallel, then aggregate. Dramatically reduces latency for decomposable workloads.",
    tags: ["parallelism", "fan-out", "aggregation"],
    steps: [
      { label: "Decompose Task", icon: "✂️", detail: "Use an LLM to split the main task into N independent subtasks. Independence is key — subtasks must not depend on each other's outputs for parallel execution to work." },
      { label: "Spawn Workers", icon: "⚡", detail: "Map each subtask to a Promise and run all with Promise.all. Each worker is a separate LLM call with its own system prompt and tools — true parallel execution." },
      { label: "Error Isolation", icon: "🛡️", detail: "Use Promise.allSettled instead of Promise.all to prevent one failed worker from cancelling the others. Inspect each result's status independently." },
      { label: "Aggregate Results", icon: "🔗", detail: "Collect all fulfilled worker outputs into a single context and pass to a synthesis agent. The synthesis agent's job is to merge, deduplicate, and resolve conflicts." },
      { label: "Token Budget", icon: "💰", detail: "Parallel workers multiply your token usage. Set per-worker max_tokens budgets to avoid runaway costs. Consider using a smaller model (e.g. claude-haiku-4-5) for subtasks." },
    ],
    code: `import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic();

// ── Decomposer ────────────────────────────────────────────────────────────────

async function decomposeTask(task, numSubtasks = 4) {
  const response = await claude.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: \`Break this task into exactly \${numSubtasks} independent subtasks that can be worked on in parallel.
Each subtask should be self-contained and not depend on the others.
Return ONLY a JSON array of strings.

Task: \${task}\`,
    }],
  });

  const text = response.content[0].text.replace(/\`\`\`json|\\n\`\`\`/g, "").trim();
  return JSON.parse(text);
}

// ── Specialist worker ─────────────────────────────────────────────────────────

async function runWorker(subtask, workerIndex) {
  const t0 = Date.now();
  const response = await claude.messages.create({
    model: "claude-haiku-4-5-20251001",  // cheaper model for subtasks
    max_tokens: 512,
    system: "You are a specialist analyst. Complete the assigned subtask thoroughly and concisely.",
    messages: [{ role: "user", content: subtask }],
  });
  const latency = Date.now() - t0;
  const text = response.content[0].text;
  console.log(\`Worker \${workerIndex + 1} done in \${latency}ms (\${response.usage.output_tokens} tokens)\`);
  return { subtask, result: text, latency, tokens: response.usage.output_tokens };
}

// ── Synthesizer ───────────────────────────────────────────────────────────────

async function synthesize(originalTask, workerResults) {
  const combined = workerResults
    .map((r, i) => \`## Subtask \${i + 1}: \${r.subtask}\\n\${r.result}\`)
    .join("\\n\\n");

  const response = await claude.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: \`Synthesize these parallel research outputs into a single coherent answer.
Original task: \${originalTask}

Worker outputs:
\${combined}

Produce a unified, non-redundant response that integrates all findings.\`,
    }],
  });

  return response.content[0].text;
}

// ── Fan-out orchestrator ──────────────────────────────────────────────────────

async function parallelAgentFanOut(task) {
  const wallStart = Date.now();
  console.log(\`Task: \${task}\\n\`);

  // Step 1: Decompose
  const subtasks = await decomposeTask(task, 4);
  console.log(\`Decomposed into \${subtasks.length} subtasks:\`);
  subtasks.forEach((s, i) => console.log(\`  \${i + 1}. \${s}\`));

  // Step 2: Run all workers in parallel (error-isolated)
  console.log(\`\\nRunning \${subtasks.length} workers in parallel...\`);
  const settled = await Promise.allSettled(
    subtasks.map((subtask, i) => runWorker(subtask, i))
  );

  const succeeded = settled
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  const failed = settled.filter((r) => r.status === "rejected");
  if (failed.length) console.warn(\`\${failed.length} worker(s) failed and were skipped.\`);

  // Step 3: Synthesize
  console.log(\`\\nSynthesizing \${succeeded.length} results...\`);
  const finalAnswer = await synthesize(task, succeeded);

  const wallTime = Date.now() - wallStart;
  const totalTokens = succeeded.reduce((s, r) => s + r.tokens, 0);
  console.log(\`\\n✓ Done in \${wallTime}ms | Worker tokens: \${totalTokens}\`);

  return finalAnswer;
}

const answer = await parallelAgentFanOut(
  "Produce a comprehensive competitive analysis of the top cloud providers (AWS, Azure, GCP, Oracle) covering pricing, AI services, global infrastructure, and enterprise support."
);
console.log("\\n── Final Answer ──────────────────────────────────");
console.log(answer);`,
  },
];

const CATEGORIES = ["All", "Swarm", "LangGraph", "CrewAI", "AutoGen", "Custom", "Patterns"];
const DIFFICULTIES = { Beginner: "#0F6E56", Intermediate: "#185FA5", Advanced: "#993C1D" };
const DIFFICULTY_BG = { Beginner: "#E1F5EE", Intermediate: "#E6F1FB", Advanced: "#FAECE7" };

function StepFlow({ steps }) {
  const [active, setActive] = useState(null);
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setActive(active === i ? null : i)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                borderRadius: 20, border: active === i ? "1.5px solid #185FA5" : "0.5px solid var(--color-border-tertiary)",
                background: active === i ? "#E6F1FB" : "var(--color-background-primary)",
                color: active === i ? "#185FA5" : "var(--color-text-primary)",
                cursor: "pointer", fontSize: 13, fontWeight: active === i ? 500 : 400,
                transition: "all 0.15s",
              }}
            >
              <span>{step.icon}</span>
              <span>{step.label}</span>
            </button>
            {i < steps.length - 1 && (
              <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>→</span>
            )}
          </div>
        ))}
      </div>
      {active !== null && (
        <div style={{
          marginTop: 10, padding: "10px 14px", borderRadius: 8,
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-tertiary)",
          fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6,
        }}>
          <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{steps[active].label}: </span>
          {steps[active].detail}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div style={{ position: "relative", marginTop: 16 }}>
      <button
        onClick={copy}
        style={{
          position: "absolute", top: 8, right: 8, padding: "4px 10px",
          borderRadius: 6, border: "0.5px solid var(--color-border-secondary)",
          background: "var(--color-background-secondary)", cursor: "pointer",
          fontSize: 12, color: "var(--color-text-secondary)", zIndex: 1,
        }}
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
      <pre style={{
        margin: 0, padding: "14px 16px", borderRadius: 10, overflowX: "auto",
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        fontSize: 12, lineHeight: 1.65, fontFamily: "var(--font-mono)",
        color: "var(--color-text-primary)", whiteSpace: "pre",
      }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function RecipeCard({ recipe, onSelect, selected }) {
  return (
    <div
      onClick={() => onSelect(recipe)}
      style={{
        padding: "16px 18px", borderRadius: 12, cursor: "pointer",
        border: selected ? "1.5px solid #185FA5" : "0.5px solid var(--color-border-tertiary)",
        background: selected ? "#061320" : "var(--color-background-primary)",
        transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 400 }}>
          {recipe.category}
        </span>
        <span style={{
          fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500,
          background: DIFFICULTY_BG[recipe.difficulty], color: DIFFICULTIES[recipe.difficulty],
        }}>
          {recipe.difficulty}
        </span>
      </div>
      <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 4, color: "var(--color-text-primary)" }}>
        {recipe.title}
      </div>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
        {recipe.description}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {recipe.tags.map((t) => (
          <span key={t} style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 20,
            background: "var(--color-background-tertiary)",
            color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)",
          }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function RecipeDetail({ recipe }) {
  const [tab, setTab] = useState("steps");
  return (
    <div style={{ padding: "24px", borderRadius: 14, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{recipe.category}</span>
          <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 500 }}>{recipe.title}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 4 }}>
          <span style={{
            fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 500,
            background: DIFFICULTY_BG[recipe.difficulty], color: DIFFICULTIES[recipe.difficulty],
          }}>{recipe.difficulty}</span>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>⏱ {recipe.time}</span>
        </div>
      </div>
      <p style={{ margin: "0 0 20px", color: "var(--color-text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
        {recipe.description}
      </p>

      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "0.5px solid var(--color-border-tertiary)", paddingBottom: 0 }}>
        {["steps", "code"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 14, fontWeight: tab === t ? 500 : 400,
              color: tab === t ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              borderBottom: tab === t ? "2px solid #185FA5" : "2px solid transparent",
              marginBottom: -1, transition: "all 0.12s",
            }}
          >
            {t === "steps" ? "Pipeline Steps" : "Code"}
          </button>
        ))}
      </div>

      {tab === "steps" && <StepFlow steps={recipe.steps} />}
      {tab === "code" && <CodeBlock code={recipe.code} />}
    </div>
  );
}

function Sidebar({ recipes, selected, onSelect, category, setCategory, search, setSearch }) {
  const filtered = recipes.filter((r) => {
    const matchCat = category === "All" || r.category === category;
    const matchSearch = r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      <div style={{ padding: "0 0 16px" }}>
        <input
          type="text"
          placeholder="Search recipes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", padding: "8px 12px",
            borderRadius: 8, border: "0.5px solid var(--color-border-secondary)",
            background: "var(--color-background-secondary)",
            color: "var(--color-text-primary)", fontSize: 13,
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              border: category === c ? "1.5px solid #185FA5" : "0.5px solid var(--color-border-tertiary)",
              background: category === c ? "#E6F1FB" : "var(--color-background-primary)",
              color: category === c ? "#185FA5" : "var(--color-text-secondary)",
              fontWeight: category === c ? 500 : 400,
            }}
          >
            {c}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ color: "var(--color-text-tertiary)", fontSize: 13, padding: "12px 0" }}>No recipes found.</div>
        ) : filtered.map((r) => (
          <RecipeCard key={r.id} recipe={r} onSelect={onSelect} selected={selected?.id === r.id} />
        ))}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div style={{
      padding: "20px 32px 16px",
      borderBottom: "0.5px solid var(--color-border-tertiary)",
      display: "flex", alignItems: "center", gap: 16,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20,
      }}>
        🧩
      </div>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: "-0.3px" }}>Multi-Agent Frameworks</h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
          End-to-end recipes for Swarm, LangGraph, CrewAI, AutoGen & custom orchestration
        </p>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 20 }}>
        {[
          { label: "Recipes", value: FRAMEWORKS.length },
          { label: "Frameworks", value: CATEGORIES.length - 1 },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 500 }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [selected, setSelected] = useState(FRAMEWORKS[0]);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh", fontFamily: "var(--font-sans, system-ui, sans-serif)",
      background: "var(--color-background-tertiary, #152060)",
      color: "var(--color-text-primary)",
    }}>
      <Header />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{
          width: 320, minWidth: 260, padding: "20px 20px",
          borderRight: "0.5px solid var(--color-border-tertiary)",
          background: "var(--color-background-primary)",
          overflowY: "auto",
        }}>
          <Sidebar
            recipes={FRAMEWORKS}
            selected={selected}
            onSelect={setSelected}
            category={category}
            setCategory={setCategory}
            search={search}
            setSearch={setSearch}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {selected ? (
            <RecipeDetail recipe={selected} />
          ) : (
            <div style={{ color: "var(--color-text-tertiary)", padding: 40, textAlign: "center" }}>
              Select a recipe to get started
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
