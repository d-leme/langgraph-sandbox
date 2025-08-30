export default function HomePage() {
  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          LangGraph Demo App
        </h1>
        <p className="text-muted-foreground">
          Explore the different components and features using the sidebar
          navigation.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="bg-card rounded-lg border p-6 shadow-sm">
          <h3 className="text-lg font-semibold">
            Demo 1 - Chatbot Fan-In/Fan-Out
          </h3>
          <p className="text-muted-foreground mt-2 text-sm">
            Explore chatbot interactions with fan-in/fan-out patterns for
            processing multiple inputs.
          </p>
        </div>

        <div className="bg-card rounded-lg border p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Demo 2 - RAG</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            Retrieval-Augmented Generation for enhanced AI responses using
            external knowledge.
          </p>
        </div>

        <div className="bg-card rounded-lg border p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Demo 3 - MCP & Agents</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            Model Context Protocol integration with intelligent agent workflows.
          </p>
        </div>

        <div className="bg-card rounded-lg border p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Demo 4 - Rollback</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            State management and rollback capabilities in LangGraph workflows.
          </p>
        </div>
      </div>
    </div>
  );
}
