import { cn } from '@/lib/utils';
import { User, Sparkles, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Components } from 'react-markdown';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  timestamp?: Date;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const markdownComponents: Components = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = String(children).replace(/\n$/, '');
      const isInline = !match && !codeString.includes('\n');
      
      if (isInline) {
        return (
          <code 
            className="bg-muted/80 text-foreground px-1.5 py-0.5 rounded text-[0.85em] font-mono" 
            {...props}
          >
            {children}
          </code>
        );
      }

      return (
        <div className="relative my-3 group/code">
          {match && (
            <div className="absolute top-0 left-0 px-3 py-1 text-xs text-muted-foreground bg-sidebar/80 rounded-tl-lg rounded-br-lg font-mono">
              {match[1]}
            </div>
          )}
          <SyntaxHighlighter
            style={oneDark}
            language={match?.[1] || 'text'}
            PreTag="div"
            customStyle={{
              margin: 0,
              borderRadius: '0.5rem',
              padding: '2.5rem 1rem 1rem 1rem',
              fontSize: '0.85rem',
            }}
          >
            {codeString}
          </SyntaxHighlighter>
        </div>
      );
    },
    h1: ({ children }) => (
      <h1 className="font-heading font-black text-lg mt-5 mb-3 text-foreground">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="font-heading font-bold text-base mt-5 mb-2 text-foreground">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="font-heading font-semibold text-sm mt-4 mb-2 text-foreground">{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className="font-heading font-medium text-sm mt-3 mb-1.5 text-foreground">{children}</h4>
    ),
    p: ({ children }) => (
      <p className="my-2 leading-relaxed">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="my-2 ml-1 space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="my-2 ml-1 space-y-1 list-decimal list-inside">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="flex gap-2">
        <span className="text-primary font-bold mt-0.5">•</span>
        <span className="flex-1">{children}</span>
      </li>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="italic">{children}</em>
    ),
    a: ({ href, children }) => (
      <a 
        href={href} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
      >
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-primary/40 pl-4 my-3 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-4 rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-muted/50">{children}</thead>
    ),
    tbody: ({ children }) => (
      <tbody className="divide-y divide-border">{children}</tbody>
    ),
    tr: ({ children }) => (
      <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
    ),
    th: ({ children }) => (
      <th className="px-3 py-2 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-2 text-sm">{children}</td>
    ),
    hr: () => (
      <hr className="my-4 border-border" />
    ),
  };

  return (
    <div className={cn("flex gap-4 group", isUser && "justify-end")}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
      
      {/* Message content */}
      <div className={cn(
        "flex-1 max-w-[85%] min-w-0",
        isUser && "flex justify-end"
      )}>
        <div className={cn(
          "rounded-2xl px-4 py-3",
          isUser 
            ? "bg-primary text-primary-foreground rounded-br-md" 
            : "bg-muted/60"
        )}>
          <div className={cn(
            "text-sm prose-sm max-w-none",
            isUser ? "text-primary-foreground" : "text-foreground"
          )}>
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {content}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-flex items-center gap-1 ml-1">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse [animation-delay:300ms]" />
              </span>
            )}
          </div>
        </div>
        
        {/* Copy button for assistant messages */}
        {!isUser && content && !isStreaming && (
          <div className="flex mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
          <User className="h-4 w-4 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
}
