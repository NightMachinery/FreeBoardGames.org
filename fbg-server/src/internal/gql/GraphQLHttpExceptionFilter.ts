import { Catch, HttpException } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

function getMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (response && typeof response === 'object' && 'message' in response) {
    const message = (response as any).message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    if (typeof message === 'string') {
      return message;
    }
  }
  return exception.message;
}

function getCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_USER_INPUT';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    default:
      return 'INTERNAL_SERVER_ERROR';
  }
}

@Catch(HttpException)
export class GraphQLHttpExceptionFilter implements GqlExceptionFilter {
  catch(exception: HttpException) {
    const status = exception.getStatus();
    return new GraphQLError(getMessage(exception), {
      extensions: {
        code: getCode(status),
        http: { status },
      },
    });
  }
}
