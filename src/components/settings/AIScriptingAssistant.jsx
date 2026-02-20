import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function AIScriptingAssistant({ onScriptGenerated }) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedScript, setGeneratedScript] = useState(null);

  const generateScript = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    setGenerating(true);

    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a professional video script writer for e-commerce demo videos. 
Write a compelling, concise video script based on this request: "${prompt}"

The script should:
- Be 60-90 seconds when read aloud
- Highlight key profit protection features
- Use professional, persuasive language
- Include clear value propositions
- Be structured with intro, key points, and call-to-action

Format as a clean, production-ready script.`,
        response_json_schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            duration_estimate: { type: 'string' },
            script: { type: 'string' },
            key_points: { type: 'array', items: { type: 'string' } },
            tone: { type: 'string' }
          }
        }
      });

      setGeneratedScript(res);
      toast.success('Script generated successfully');
      
      if (onScriptGenerated) {
        onScriptGenerated(res);
      }
    } catch (error) {
      console.error('[AI Script] Error:', error);
      toast.error('Failed to generate script');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-purple-600" />
          AI Video Scripting Assistant
        </CardTitle>
        <CardDescription>
          Generate professional video scripts with AI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>What should your demo video highlight?</Label>
          <Textarea
            placeholder="E.g., Focus on fraud detection and profit protection for Shopify stores..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="mt-2"
          />
        </div>

        <Button 
          onClick={generateScript} 
          disabled={generating || !prompt.trim()}
          className="w-full"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating Script...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Script
            </>
          )}
        </Button>

        {generatedScript && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <div>
              <h4 className="font-semibold text-sm text-slate-700">
                {generatedScript.title}
              </h4>
              <p className="text-xs text-slate-500">
                Duration: {generatedScript.duration_estimate} • Tone: {generatedScript.tone}
              </p>
            </div>

            <div className="text-sm text-slate-700 whitespace-pre-wrap">
              {generatedScript.script}
            </div>

            {generatedScript.key_points && (
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1">Key Points:</p>
                <ul className="text-xs text-slate-600 space-y-1">
                  {generatedScript.key_points.map((point, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-purple-600">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}