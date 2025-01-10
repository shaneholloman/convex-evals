class VerificationError(Exception):
    def __init__(self, message: str, metadata):
        self.message = message
        self.metadata = metadata
        super().__init__(message)   

    def __str__(self):
        return self.message + "\n" + "\n".join(self.metadata)

def error_status(error):
    if isinstance(error, VerificationError):
        return { "status": "failed", "error": error.metadata }
    return { "status": "failed", "error": str(error) }
