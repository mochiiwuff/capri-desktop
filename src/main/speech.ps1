param([string]$CultureName = 'en-US', [switch]$ListCultures)

$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.Globalization;
using System.Linq;
using System.Speech.Recognition;

public sealed class CapriLocalSpeech : IDisposable
{
    private readonly SpeechRecognitionEngine engine;

    public CapriLocalSpeech(string cultureName)
    {
        CultureInfo culture = CultureInfo.GetCultureInfo(cultureName);
        RecognizerInfo recognizer = SpeechRecognitionEngine.InstalledRecognizers()
            .FirstOrDefault(item => String.Equals(item.Culture.Name, culture.Name, StringComparison.OrdinalIgnoreCase));
        if (recognizer == null)
            throw new InvalidOperationException("voiceLanguageUnsupported");

        engine = new SpeechRecognitionEngine(recognizer);
        engine.LoadGrammar(new DictationGrammar());
        engine.SpeechRecognized += OnSpeechRecognized;
        try
        {
            engine.SetInputToDefaultAudioDevice();
        }
        catch
        {
            engine.Dispose();
            throw new InvalidOperationException("voiceMicrophoneUnavailable");
        }
    }

    public void Start()
    {
        engine.RecognizeAsync(RecognizeMode.Multiple);
        Console.WriteLine("{\"type\":\"listening\"}");
    }

    private static string Escape(string value)
    {
        return value.Replace("\\", "\\\\").Replace("\"", "\\\"")
            .Replace("\r", "\\r").Replace("\n", "\\n").Replace("\t", "\\t");
    }

    private void OnSpeechRecognized(object sender, SpeechRecognizedEventArgs args)
    {
        if (args.Result.Confidence < 0.45f || String.IsNullOrWhiteSpace(args.Result.Text))
            return;
        Console.WriteLine("{\"type\":\"transcript\",\"text\":\"" + Escape(args.Result.Text) + "\"}");
    }

    public void Dispose()
    {
        engine.RecognizeAsyncCancel();
        engine.Dispose();
    }
}
'@

try {
    Add-Type -ReferencedAssemblies System.Speech -TypeDefinition $source
    if ($ListCultures) {
        $cultures = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
            ForEach-Object { $_.Culture.Name }
        [Console]::WriteLine((ConvertTo-Json -Compress -InputObject @($cultures)))
        exit 0
    }
    $speech = New-Object -TypeName CapriLocalSpeech -ArgumentList $CultureName
    $speech.Start()
    while ($true) { Start-Sleep -Seconds 1 }
}
catch {
    $code = if ($_.Exception.Message -match 'voiceLanguageUnsupported') {
        'voiceLanguageUnsupported'
    } elseif ($_.Exception.Message -match 'voiceMicrophoneUnavailable') {
        'voiceMicrophoneUnavailable'
    } else {
        'voiceStartFailed'
    }
    [Console]::WriteLine("{`"type`":`"error`",`"error`":`"$code`"}")
    exit 0
}
finally {
    if ($speech) { $speech.Dispose() }
}
